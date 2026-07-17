// @ts-check
/**
 * Lyraxc web UI controller.
 *
 * Connects to the backend WebSocket, sends a "run" command and renders the
 * streamed agent events live. Kept framework-free for zero build tooling.
 */

const form = /** @type {HTMLFormElement} */ (document.getElementById('task-form'));
const runBtn = /** @type {HTMLButtonElement} */ (document.getElementById('run-btn'));
const logEl = /** @type {HTMLOListElement} */ (document.getElementById('event-log'));
const badge = /** @type {HTMLSpanElement} */ (document.getElementById('status-badge'));

/** Build the WebSocket URL, respecting the current host and optional API key. */
function wsUrl(apiKey) {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const base = `${proto}://${location.host}/ws`;
  return apiKey ? `${base}?apiKey=${encodeURIComponent(apiKey)}` : base;
}

/** Append a log entry with a timestamp and semantic style. */
function log(message, variant = 'meta') {
  const li = document.createElement('li');
  li.className = `event--${variant}`;
  const time = document.createElement('time');
  time.textContent = new Date().toLocaleTimeString();
  li.append(time, document.createTextNode(message));
  logEl.append(li);
  li.scrollIntoView({ block: 'nearest' });
}

/** Update the status badge text and colour state. */
function setStatus(state) {
  badge.textContent = state;
  badge.dataset.state = state;
}

/** Enable/disable the form while a task is running. */
function setRunning(running) {
  runBtn.disabled = running;
  runBtn.textContent = running ? 'Running…' : 'Run task';
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const instruction = /** @type {HTMLTextAreaElement} */ (
    document.getElementById('instruction')
  ).value.trim();
  const startUrl = /** @type {HTMLInputElement} */ (
    document.getElementById('start-url')
  ).value.trim();
  const apiKey = /** @type {HTMLInputElement} */ (
    document.getElementById('api-key')
  ).value.trim();

  if (!instruction) {
    log('Please enter an instruction.', 'fail');
    return;
  }

  logEl.replaceChildren();
  setRunning(true);
  setStatus('connecting');

  let socket;
  try {
    socket = new WebSocket(wsUrl(apiKey));
  } catch (err) {
    log(`Could not open connection: ${String(err)}`, 'fail');
    setRunning(false);
    return;
  }

  socket.addEventListener('open', () => {
    setStatus('running');
    log(`Task submitted: ${instruction}`, 'meta');
    socket.send(
      JSON.stringify({
        type: 'run',
        instruction,
        ...(startUrl ? { startUrl } : {}),
      }),
    );
  });

  socket.addEventListener('message', (msg) => {
    let data;
    try {
      data = JSON.parse(msg.data);
    } catch {
      return;
    }
    handleEvent(data, socket);
  });

  socket.addEventListener('error', () => {
    log('Connection error.', 'fail');
  });

  socket.addEventListener('close', () => {
    setRunning(false);
  });
});

/** Render a single agent event. */
function handleEvent(data, socket) {
  switch (data.type) {
    case 'task:started':
      log(`Started task ${data.task.id}`, 'meta');
      break;
    case 'step:planned':
      log(`Plan #${data.stepIndex}: ${describeAction(data.action)}`, 'plan');
      break;
    case 'step:executed': {
      const r = data.result;
      const variant = r.success ? 'ok' : 'fail';
      const detail = r.observation || r.error || '';
      log(`Step #${data.stepIndex}: ${r.action.type} ${detail}`, variant);
      break;
    }
    case 'task:status':
      setStatus(data.status);
      break;
    case 'task:finished':
      setStatus(data.task.status);
      if (data.task.summary) log(`Summary: ${data.task.summary}`, 'meta');
      if (data.task.error) log(`Error: ${data.task.error}`, 'fail');
      setRunning(false);
      socket.close();
      break;
    case 'error':
      log(`Error: ${data.message}`, 'fail');
      setStatus('failed');
      setRunning(false);
      break;
    default:
      break;
  }
}

/** Human-readable one-liner for a planned action. */
function describeAction(action) {
  switch (action.type) {
    case 'navigate':
      return `navigate to ${action.url}`;
    case 'click':
      return `click "${action.selector}"`;
    case 'type':
      return `type into "${action.selector}"`;
    case 'scroll':
      return `scroll ${action.direction}`;
    case 'wait':
      return `wait ${action.ms ?? action.selector ?? ''}`;
    case 'extract':
      return 'extract page content';
    case 'screenshot':
      return 'take screenshot';
    case 'finish':
      return `finish: ${action.summary}`;
    default:
      return action.type;
  }
}
