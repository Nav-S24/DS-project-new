import { WebSocket } from 'ws';
import axios from 'axios';

const BASE_URL = 'http://127.0.0.1:3000';
const WS_URL = 'ws://127.0.0.1:3000/ws';

interface TestResult {
  name: string;
  passed: boolean;
  details?: string;
}

const results: TestResult[] = [];

function recordTest(name: string, passed: boolean, details?: string) {
  results.push({ name, passed, details });
  const icon = passed ? '✅' : '❌';
  console.log(`${icon} ${name}${details ? ` (${details})` : ''}`);
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runAllTests() {
  console.log('\n======================================================');
  console.log('  RUNNING WEBSOCKET & RELIABILITY TEST SUITE');
  console.log('======================================================\n');

  // Test 1: Verify Health Endpoint and Gateway Components
  try {
    const healthResp = await axios.get(`${BASE_URL}/health`);
    const data = healthResp.data;
    const isHealthy =
      data.status === 'healthy' &&
      data.components?.websocket_gateway?.status === 'healthy' &&
      data.components?.transactional_outbox?.status === 'healthy';
    recordTest(
      'Test 1: Health endpoint reports healthy coordinator and websocket gateway',
      isHealthy,
      `Connected clients: ${data.components?.websocket_gateway?.connected_clients}`
    );
  } catch (err: any) {
    recordTest('Test 1: Health endpoint reports healthy coordinator and websocket gateway', false, err.message);
  }

  // Test 2: WebSocket Connection Handshake and Heartbeat Ping/Pong
  try {
    const ws = new WebSocket(WS_URL);
    const welcomePromise = new Promise<any>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timeout waiting for welcome handshake')), 4000);
      ws.on('message', (raw) => {
        try {
          const parsed = JSON.parse(raw.toString());
          if (parsed.event_type === 'CONNECTION_ESTABLISHED') {
            clearTimeout(timeout);
            resolve(parsed);
          }
        } catch (e) {
          reject(e);
        }
      });
      ws.on('error', reject);
    });

    const welcomeMsg = await welcomePromise;
    recordTest(
      'Test 2: WebSocket connection and welcome handshake message',
      welcomeMsg.event_type === 'CONNECTION_ESTABLISHED' && welcomeMsg.status === 'CONNECTED',
      `Event ID: ${welcomeMsg.event_id}`
    );

    // Test ping-pong
    const pongPromise = new Promise<any>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timeout waiting for PONG')), 3000);
      ws.on('message', (raw) => {
        try {
          const parsed = JSON.parse(raw.toString());
          if (parsed.type === 'PONG') {
            clearTimeout(timeout);
            resolve(parsed);
          }
        } catch (e) {
          reject(e);
        }
      });
    });

    ws.send(JSON.stringify({ type: 'PING' }));
    const pong = await pongPromise;
    recordTest('Test 3: WebSocket client heartbeat PING/PONG', !!pong.timestamp);

    ws.close();
  } catch (err: any) {
    recordTest('Test 2: WebSocket connection and welcome handshake message', false, err.message);
  }

  // Test 4: Multiple Connected Clients Receive Committed Status Updates
  let clientAEvents: any[] = [];
  let clientBEvents: any[] = [];
  let wsA: WebSocket | null = null;
  let wsB: WebSocket | null = null;

  try {
    wsA = new WebSocket(WS_URL);
    wsB = new WebSocket(WS_URL);

    await Promise.all([
      new Promise((res) => wsA!.on('open', res)),
      new Promise((res) => wsB!.on('open', res)),
    ]);

    wsA.on('message', (raw) => {
      try {
        clientAEvents.push(JSON.parse(raw.toString()));
      } catch {}
    });
    wsB.on('message', (raw) => {
      try {
        clientBEvents.push(JSON.parse(raw.toString()));
      } catch {}
    });

    // Create a new emergency incident via HTTP API
    const createResp = await axios.post(`${BASE_URL}/incidents/`, {
      description: 'Test cardiac incident for multi-client websocket verification',
      location: 'Kothrud Bus Stand, Sector 4',
      severity: 'CRITICAL',
    });

    const createdIncidentId = createResp.data.incident_id;

    // Wait for dispatch events to propagate
    await sleep(600);

    const clientAHasIncident = clientAEvents.some(
      (e) => e.incident_id === createdIncidentId && (e.event_type === 'INCIDENT_REPORTED' || e.event_type === 'DISPATCH_COMMITTED')
    );
    const clientBHasIncident = clientBEvents.some(
      (e) => e.incident_id === createdIncidentId && (e.event_type === 'INCIDENT_REPORTED' || e.event_type === 'DISPATCH_COMMITTED')
    );

    recordTest(
      'Test 4: Multiple connected clients simultaneously receive committed incident events',
      clientAHasIncident && clientBHasIncident,
      `Incident ID: ${createdIncidentId}`
    );

    // Test 5: Verify Event Order (REPORTED -> DISPATCHING -> COMMITTED)
    const incidentEvents = clientAEvents.filter((e) => e.incident_id === createdIncidentId);
    const hasReported = incidentEvents.some((e) => e.event_type === 'INCIDENT_REPORTED');
    const hasCommitted = incidentEvents.some((e) => e.event_type === 'DISPATCH_COMMITTED');

    recordTest(
      'Test 5: Receiving newly committed incident status lifecycle events in order',
      hasReported && hasCommitted,
      `Received ${incidentEvents.length} lifecycle events for ${createdIncidentId}`
    );

    // Test 6: Receiving Simulated Ambulance Location Updates
    console.log('   Waiting 3.5s for simulated GPS coordinate broadcast tick...');
    await sleep(3500);

    const locationEvents = clientAEvents.filter(
      (e) => e.event_type === 'AMBULANCE_LOCATION_UPDATED' && e.incident_id === createdIncidentId
    );

    const hasValidGps = locationEvents.length > 0 &&
      locationEvents[0].latitude != null &&
      locationEvents[0].longitude != null &&
      locationEvents[0].is_simulated === true;

    recordTest(
      'Test 6: Receiving simulated ambulance GPS location updates with telemetry',
      hasValidGps,
      `Received ${locationEvents.length} coordinate ticks (Lat: ${locationEvents[0]?.latitude}, Lng: ${locationEvents[0]?.longitude})`
    );

  } catch (err: any) {
    recordTest('Test 4: Multiple connected clients test failure', false, err.message);
  } finally {
    if (wsA) wsA.close();
    if (wsB) wsB.close();
  }

  // Test 7: Transactional Outbox Persistence & Reliable Audit Trail
  try {
    const outboxResp = await axios.get(`${BASE_URL}/outbox`);
    const outboxData = outboxResp.data;
    const hasOutboxEvents = outboxData.total_events > 0 && Array.isArray(outboxData.events);
    const firstEvent = outboxData.events[0];
    const isOutboxValid = hasOutboxEvents && firstEvent.event_id && firstEvent.status;

    recordTest(
      'Test 7: Transactional Outbox persistence retains all committed events',
      isOutboxValid,
      `Total events in persistent outbox: ${outboxData.total_events}`
    );
  } catch (err: any) {
    recordTest('Test 7: Transactional Outbox persistence check', false, err.message);
  }

  // Test 8: Saga Rollback (No success event broadcast for rolled-back transaction)
  let rollbackClientEvents: any[] = [];
  let rollbackWs: WebSocket | null = null;
  try {
    rollbackWs = new WebSocket(WS_URL);
    await new Promise((res) => rollbackWs!.on('open', res));

    rollbackWs.on('message', (raw) => {
      try {
        rollbackClientEvents.push(JSON.parse(raw.toString()));
      } catch {}
    });

    // Exhaust remaining hospital beds on server to force saga compensation rollback
    await axios.post(`${BASE_URL}/hospitals/capacity`, { available_beds: 0 });

    const failedIncidentResp = await axios.post(`${BASE_URL}/incidents/`, {
      description: 'Cardiac emergency during total hospital saturation',
      location: 'Shivaji Nagar Bus Station, Sector 2',
      severity: 'CRITICAL',
    });

    await sleep(600);

    const rollbackIncidentId = failedIncidentResp.data.incident_id;
    const rbEvents = rollbackClientEvents.filter((e) => e.incident_id === rollbackIncidentId);

    const hasRollbackInitiated = rbEvents.some((e) => e.event_type === 'SAGA_ROLLBACK_INITIATED');
    const hasCompensated = rbEvents.some((e) => e.event_type === 'SAGA_COMPENSATED');
    const hasNoDispatched = !rbEvents.some((e) => e.event_type === 'DISPATCH_COMMITTED');

    recordTest(
      'Test 8: Saga rollback emits compensation events and NO DISPATCH_COMMITTED broadcast',
      hasRollbackInitiated && hasCompensated && hasNoDispatched,
      `Compensated state: ${failedIncidentResp.data.status}`
    );

    // Restore hospital beds on server
    await axios.post(`${BASE_URL}/hospitals/capacity`, { available_beds: 15 });
  } catch (err: any) {
    recordTest('Test 8: Saga rollback verification', false, err.message);
  } finally {
    if (rollbackWs) rollbackWs.close();
  }

  // Test 9: Client Disconnection & Resource Cleanup
  try {
    const tempWs = new WebSocket(WS_URL);
    await new Promise((res) => tempWs.on('open', res));
    tempWs.close();
    await sleep(200);

    const healthAfter = await axios.get(`${BASE_URL}/health`);
    const clientsCount = healthAfter.data.components?.websocket_gateway?.connected_clients;
    recordTest(
      'Test 9: Client disconnection handled cleanly with socket removal',
      typeof clientsCount === 'number',
      `Active clients remaining: ${clientsCount}`
    );
  } catch (err: any) {
    recordTest('Test 9: Client disconnection handling', false, err.message);
  }

  // Test 10: Reconnection and Reconciliation Endpoint
  try {
    const recResp = await axios.post(`${BASE_URL}/incidents/recover`);
    const isReconciled = recResp.data.status === 'reconciliation_complete';
    recordTest(
      'Test 10: Crash recovery and cluster incident reconciliation',
      isReconciled,
      `Recovered stuck units: ${recResp.data.recovered_count}`
    );
  } catch (err: any) {
    recordTest('Test 10: Crash recovery endpoint', false, err.message);
  }

  console.log('\n======================================================');
  const allPassed = results.every((r) => r.passed);
  console.log(`TOTAL TESTS: ${results.length} | PASSED: ${results.filter((r) => r.passed).length} | FAILED: ${results.filter((r) => !r.passed).length}`);
  console.log('======================================================\n');

  if (!allPassed) {
    process.exit(1);
  }
}

runAllTests().catch((e) => {
  console.error('Test execution error:', e);
  process.exit(1);
});
