using Azure.Messaging.ServiceBus;
using FluentAssertions;
using HealthQCopilot.Infrastructure.Messaging;
using HealthQCopilot.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using NSubstitute;
using Xunit;

namespace HealthQCopilot.Tests.Unit.Infrastructure;

public class TestOutboxDbContext : OutboxDbContext
{
    public TestOutboxDbContext(DbContextOptions<TestOutboxDbContext> options) : base(options) { }
}

public class OutboxRelayServiceTests
{
    private readonly ServiceBusSender _sender;
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<OutboxRelayService<TestOutboxDbContext>> _logger;

    public OutboxRelayServiceTests()
    {
        _sender = Substitute.For<ServiceBusSender>();
        _scopeFactory = Substitute.For<IServiceScopeFactory>();
        _logger = Substitute.For<ILogger<OutboxRelayService<TestOutboxDbContext>>>();
    }

    private TestOutboxDbContext CreateInMemoryContext()
    {
        var options = new DbContextOptionsBuilder<TestOutboxDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        var ctx = new TestOutboxDbContext(options);
        ctx.Database.EnsureCreated();
        return ctx;
    }

    private void SetupScope(TestOutboxDbContext db)
    {
        var scope = Substitute.For<IServiceScope>();
        var sp = Substitute.For<IServiceProvider>();
        sp.GetService(typeof(TestOutboxDbContext)).Returns(db);
        scope.ServiceProvider.Returns(sp);
        _scopeFactory.CreateScope().Returns(scope);
    }

    [Fact]
    public async Task ExecuteAsync_WithPendingEvents_ShouldSendAndMarkProcessed()
    {
        // Arrange
        var db = CreateInMemoryContext();
        var evt = new OutboxEvent
        {
            Id = Guid.NewGuid(),
            Type = "TestEvent",
            Payload = """{"key":"value"}""",
            CreatedAt = DateTime.UtcNow,
            ProcessedAt = null
        };
        db.OutboxEvents.Add(evt);
        await db.SaveChangesAsync();

        SetupScope(db);
        var cts = new CancellationTokenSource();

        var service = new OutboxRelayService<TestOutboxDbContext>(_scopeFactory, _sender, _logger);

        // Act - run one iteration then cancel
        cts.CancelAfter(TimeSpan.FromMilliseconds(500));
        try
        {
            await service.StartAsync(cts.Token);
            await Task.Delay(1000);
        }
        catch (OperationCanceledException) { }
        finally
        {
            await service.StopAsync(TestContext.Current.CancellationToken);
        }

        // Assert
        await _sender.Received(1).SendMessageAsync(
            Arg.Is<ServiceBusMessage>(m =>
                m.Subject == "TestEvent" &&
                m.ContentType == "application/json"),
            Arg.Any<CancellationToken>());

        var processedEvt = await db.OutboxEvents.FirstAsync();
        processedEvt.ProcessedAt.Should().NotBeNull();
    }

    [Fact]
    public async Task ExecuteAsync_WithNoEvents_ShouldNotSendMessages()
    {
        // Arrange
        var db = CreateInMemoryContext();
        SetupScope(db);
        var cts = new CancellationTokenSource();

        var service = new OutboxRelayService<TestOutboxDbContext>(_scopeFactory, _sender, _logger);

        // Act
        cts.CancelAfter(TimeSpan.FromMilliseconds(500));
        try
        {
            await service.StartAsync(cts.Token);
            await Task.Delay(1000);
        }
        catch (OperationCanceledException) { }
        finally
        {
            await service.StopAsync(TestContext.Current.CancellationToken);
        }

        // Assert
        await _sender.DidNotReceive().SendMessageAsync(
            Arg.Any<ServiceBusMessage>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task ExecuteAsync_WithAlreadyProcessedEvents_ShouldSkipThem()
    {
        // Arrange
        var db = CreateInMemoryContext();
        db.OutboxEvents.Add(new OutboxEvent
        {
            Id = Guid.NewGuid(),
            Type = "AlreadyProcessed",
            Payload = "{}",
            CreatedAt = DateTime.UtcNow.AddMinutes(-5),
            ProcessedAt = DateTime.UtcNow.AddMinutes(-4) // already processed
        });
        await db.SaveChangesAsync();

        SetupScope(db);
        var cts = new CancellationTokenSource();

        var service = new OutboxRelayService<TestOutboxDbContext>(_scopeFactory, _sender, _logger);

        // Act
        cts.CancelAfter(TimeSpan.FromMilliseconds(500));
        try
        {
            await service.StartAsync(cts.Token);
            await Task.Delay(1000);
        }
        catch (OperationCanceledException) { }
        finally
        {
            await service.StopAsync(TestContext.Current.CancellationToken);
        }

        // Assert
        await _sender.DidNotReceive().SendMessageAsync(
            Arg.Any<ServiceBusMessage>(), Arg.Any<CancellationToken>());
    }
}
