using System.Text;

namespace HealthQCopilot.Fhir.Hl7v2;

/// <summary>
/// Lightweight HL7 v2 message parser.
/// Supports encoding characters from MSH-2 (default: ^~\&amp;).
/// Segments separated by CR (\r = 0x0D).
/// </summary>
public sealed class Hl7v2Message
{
    public string MessageType { get; private set; } = string.Empty;
    public string EventTrigger { get; private set; } = string.Empty;
    public string MessageControlId { get; private set; } = string.Empty;
    public string SendingApplication { get; private set; } = string.Empty;
    public string SendingFacility { get; private set; } = string.Empty;
    public string Timestamp { get; private set; } = string.Empty;
    public string Version { get; private set; } = string.Empty;

    private readonly Dictionary<string, List<string[][][]>> _segments = new(StringComparer.OrdinalIgnoreCase);

    private char _fieldSep = '|';
    private char _componentSep = '^';
    private char _repetitionSep = '~';
    private char _escapeChar = '\\';
    private char _subComponentSep = '&';

    private Hl7v2Message() { }

    /// <summary>
    /// Parses a raw HL7 v2 message string (CR-delimited segments).
    /// </summary>
    public static Hl7v2Message Parse(string raw)
    {
        var msg = new Hl7v2Message();
        // Normalise line endings — HL7 uses \r; some senders send \r\n
        var lines = raw.Replace("\r\n", "\r").Split('\r',
            StringSplitOptions.RemoveEmptyEntries);

        if (lines.Length == 0 || !lines[0].StartsWith("MSH", StringComparison.OrdinalIgnoreCase))
            throw new FormatException("HL7 v2 message must start with MSH segment");

        // MSH field separator is MSH[3], encoding chars in MSH[4]
        var msh = lines[0];
        msg._fieldSep = msh[3];
        if (msh.Length > 7)
        {
            var enc = msh[4..8]; // ^~\&
            if (enc.Length >= 1) msg._componentSep = enc[0];
            if (enc.Length >= 2) msg._repetitionSep = enc[1];
            if (enc.Length >= 3) msg._escapeChar = enc[2];
            if (enc.Length >= 4) msg._subComponentSep = enc[3];
        }

        foreach (var line in lines)
        {
            if (string.IsNullOrWhiteSpace(line)) continue;

            var segId = line.Length >= 3 ? line[..3] : line;
            // For MSH, field 1 is the field separator itself (MSH-1)
            var fieldsRaw = segId == "MSH"
                ? line[3..].Split(msg._fieldSep) // MSH|...|...
                : line[4..].Split(msg._fieldSep); // XXX|...|...

            // Parse fields into components
            var parsed = fieldsRaw.Select(f =>
                f.Split(msg._repetitionSep)
                 .Select(rep => rep.Split(msg._componentSep))
                 .ToArray()
            ).ToArray();

            if (!msg._segments.TryGetValue(segId, out var list))
            {
                list = [];
                msg._segments[segId] = list;
            }
            list.Add(parsed);
        }

        // Populate convenience properties from MSH
        var mshFields = msg.GetFields("MSH", 0);
        msg.MessageType = mshFields.Get(8, 0, 0);  // MSH-9.1 message code
        msg.EventTrigger = mshFields.Get(8, 0, 1);  // MSH-9.2 trigger event
        msg.MessageControlId = mshFields.Get(9, 0, 0);
        msg.SendingApplication = mshFields.Get(2, 0, 0);
        msg.SendingFacility = mshFields.Get(3, 0, 0);
        msg.Timestamp = mshFields.Get(6, 0, 0);
        msg.Version = mshFields.Get(11, 0, 0);

        return msg;
    }

    /// <summary>Returns the parsed fields for the n-th occurrence of a segment.</summary>
    public SegmentFields GetFields(string segmentId, int occurrence = 0)
    {
        if (_segments.TryGetValue(segmentId, out var list) && occurrence < list.Count)
            return new SegmentFields(list[occurrence]);
        return SegmentFields.Empty;
    }

    /// <summary>Returns true if the segment is present in the message.</summary>
    public bool HasSegment(string segmentId) => _segments.ContainsKey(segmentId);

    /// <summary>Count of a given segment occurrence (for repeating segments like OBX).</summary>
    public int SegmentCount(string segmentId) =>
        _segments.TryGetValue(segmentId, out var list) ? list.Count : 0;

    public static Hl7v2Message Parse(byte[] bytes) =>
        Parse(Encoding.UTF8.GetString(bytes));
}

/// <summary>Provides safe field/component access for a single HL7 v2 segment occurrence.</summary>
public sealed class SegmentFields
{
    private readonly string[][][] _fields;

    public static readonly SegmentFields Empty = new([]);

    public SegmentFields(string[][][] fields) => _fields = fields;

    /// <summary>
    /// Gets field[fieldIndex] → repetition[repIndex] → component[compIndex].
    /// Returns empty string if out of bounds.
    /// </summary>
    public string Get(int fieldIndex, int repIndex = 0, int compIndex = 0)
    {
        if (fieldIndex >= _fields.Length) return string.Empty;
        var repetitions = _fields[fieldIndex];
        if (repIndex >= repetitions.Length) return string.Empty;
        var components = repetitions[repIndex];
        if (compIndex >= components.Length) return string.Empty;
        return components[compIndex] ?? string.Empty;
    }
}
