class Thread {
    static nextId = 1;

    constructor(name, priority = 5, instructions = []) {
        this.id = Thread.nextId++;
        this.name = name || `T${this.id}`;
        this.priority = priority;
        this.state = 'NEW';
        this.instructions = instructions;
        this.currentInstruction = 0;
        this.arrivalTime = 0;
        this.burstTime = instructions.length;
        this.remainingTime = instructions.length;
        this.waitTime = 0;
        this.turnaroundTime = 0;
        this.completionTime = 0;
        this.timeInCurrentState = 0;
        this.quantum = 0;
        this.kernelThreadId = null;
    }

    execute() {
        if (this.currentInstruction >= this.instructions.length) {
            return { done: true };
        }

        const instruction = this.instructions[this.currentInstruction];
        this.currentInstruction++;
        this.remainingTime--;
        this.quantum++;

        return { done: false, instruction };
    }

    isComplete() {
        return this.currentInstruction >= this.instructions.length;
    }

    setState(newState) {
        this.state = newState;
        this.timeInCurrentState = 0;
    }

    tick() {
        this.timeInCurrentState++;
        if (this.state === 'READY' || this.state === 'BLOCKED') {
            this.waitTime++;
        }
    }
}

class Semaphore {
    constructor(name, initialValue = 1) {
        this.name = name;
        this.value = initialValue;
        this.waitQueue = [];
    }

    wait(thread) {
        this.value--;
        if (this.value < 0) {
            this.waitQueue.push(thread);
            return false;
        }
        return true;
    }

    signal() {
        this.value++;
        if (this.waitQueue.length > 0) {
            return this.waitQueue.shift();
        }
        return null;
    }
}

class Monitor {
    constructor(name) {
        this.name = name;
        this.owner = null;
        this.entryQueue = [];
        this.conditionQueue = [];
    }

    enter(thread) {
        if (this.owner === null) {
            this.owner = thread;
            return true;
        }
        this.entryQueue.push(thread);
        return false;
    }

    exit() {
        const previousOwner = this.owner;
        this.owner = null;

        if (this.conditionQueue.length > 0) {
            this.owner = this.conditionQueue.shift();
            return { nextThread: this.owner, wasWaiting: true };
        }

        if (this.entryQueue.length > 0) {
            this.owner = this.entryQueue.shift();
            return { nextThread: this.owner, wasWaiting: false };
        }

        return { nextThread: null, wasWaiting: false };
    }

    wait(thread) {
        if (this.owner === thread) {
            this.conditionQueue.push(thread);
            this.owner = null;

            if (this.entryQueue.length > 0) {
                this.owner = this.entryQueue.shift();
                return { nextThread: this.owner, currentBlocked: true };
            }
            return { nextThread: null, currentBlocked: true };
        }
        return { nextThread: null, currentBlocked: false };
    }

    signal() {
        if (this.conditionQueue.length > 0) {
            return this.conditionQueue.shift();
        }
        return null;
    }
}

class CPUCore {
    constructor(id) {
        this.id = id;
        this.currentThread = null;
        this.isIdle = true;
        this.totalBusyTime = 0;
    }

    assignThread(thread) {
        this.currentThread = thread;
        this.isIdle = false;
        thread.setState('RUNNING');
    }

    releaseThread() {
        const thread = this.currentThread;
        this.currentThread = null;
        this.isIdle = true;
        return thread;
    }

    tick() {
        if (!this.isIdle) {
            this.totalBusyTime++;
        }
    }
}

class Scheduler {
    constructor(algorithm, timeQuantum = 3) {
        this.algorithm = algorithm;
        this.timeQuantum = timeQuantum;
    }

    selectNextThread(readyQueue) {
        if (readyQueue.length === 0) return null;

        switch (this.algorithm) {
            case 'fcfs':
                return readyQueue.shift();

            case 'priority':
                let highestPriorityIndex = 0;
                for (let i = 1; i < readyQueue.length; i++) {
                    if (readyQueue[i].priority > readyQueue[highestPriorityIndex].priority) {
                        highestPriorityIndex = i;
                    }
                }
                return readyQueue.splice(highestPriorityIndex, 1)[0];

            case 'round-robin':
            default:
                return readyQueue.shift();
        }
    }

    shouldPreempt(thread) {
        if (this.algorithm === 'round-robin') {
            return thread.quantum >= this.timeQuantum;
        }
        return false;
    }
}

class SimulationEngine {
    constructor() {
        this.threads = [];
        this.readyQueue = [];
        this.blockedQueue = [];
        this.terminatedThreads = [];
        this.cpuCores = [];
        this.semaphores = new Map();
        this.monitors = new Map();
        this.scheduler = new Scheduler('round-robin', 3);
        this.clockTick = 0;
        this.isRunning = false;
        this.threadingModel = 'one-to-one';
        this.userThreadCount = 0;
        this.kernelThreadCount = 0;
        this.eventLog = [];
    }

    initialize(numCores, schedulingAlgo, timeQuantum, threadingModel) {
        this.reset();
        this.cpuCores = Array.from({ length: numCores }, (_, i) => new CPUCore(i));
        this.scheduler = new Scheduler(schedulingAlgo, timeQuantum);
        this.threadingModel = threadingModel;
        this.log(`Initialized with ${numCores} cores, ${schedulingAlgo} scheduling, ${threadingModel} model`, 'info');
    }

    reset() {
        this.threads = [];
        this.readyQueue = [];
        this.blockedQueue = [];
        this.terminatedThreads = [];
        this.cpuCores = [];
        this.semaphores.clear();
        this.monitors.clear();
        this.clockTick = 0;
        this.isRunning = false;
        this.userThreadCount = 0;
        this.kernelThreadCount = 0;
        this.eventLog = [];
        Thread.nextId = 1;
    }

    addThread(thread) {
        thread.arrivalTime = this.clockTick;
        this.threads.push(thread);
        this.userThreadCount++;

        this.mapThreadToKernel(thread);

        thread.setState('NEW');
        this.log(`Thread ${thread.name} created (Priority: ${thread.priority}, Burst: ${thread.burstTime})`, 'success');

        setTimeout(() => {
            if (thread.state === 'NEW') {
                this.moveToReady(thread);
            }
        }, 100);
    }

    mapThreadToKernel(thread) {
        switch (this.threadingModel) {
            case 'one-to-one':
                this.kernelThreadCount++;
                thread.kernelThreadId = this.kernelThreadCount;
                break;

            case 'many-to-one':
                if (this.kernelThreadCount === 0) {
                    this.kernelThreadCount = 1;
                }
                thread.kernelThreadId = 1;
                break;

            case 'many-to-many':
                thread.kernelThreadId = (this.userThreadCount % this.cpuCores.length) + 1;
                if (thread.kernelThreadId > this.kernelThreadCount) {
                    this.kernelThreadCount = thread.kernelThreadId;
                }
                break;
        }
    }

    moveToReady(thread) {
        thread.setState('READY');
        this.readyQueue.push(thread);
        this.log(`Thread ${thread.name} moved to READY queue`, 'info');
    }

    moveToBlocked(thread, reason) {
        thread.setState('BLOCKED');
        if (!this.blockedQueue.includes(thread)) {
            this.blockedQueue.push(thread);
        }
        this.log(`Thread ${thread.name} blocked (${reason})`, 'warning');
    }

    moveToTerminated(thread) {
        thread.setState('TERMINATED');
        thread.completionTime = this.clockTick;
        thread.turnaroundTime = thread.completionTime - thread.arrivalTime;
        this.terminatedThreads.push(thread);
        this.log(`Thread ${thread.name} terminated (Turnaround: ${thread.turnaroundTime})`, 'success');
    }

    addSemaphore(name, initialValue) {
        const semaphore = new Semaphore(name, initialValue);
        this.semaphores.set(name, semaphore);
        this.log(`Semaphore ${name} created (Initial value: ${initialValue})`, 'info');
        return semaphore;
    }

    addMonitor(name) {
        const monitor = new Monitor(name);
        this.monitors.set(name, monitor);
        this.log(`Monitor ${name} created`, 'info');
        return monitor;
    }

    tick() {
        this.clockTick++;

        this.threads.forEach(thread => thread.tick());

        this.cpuCores.forEach(core => {
            core.tick();

            if (!core.isIdle && core.currentThread) {
                const thread = core.currentThread;
                const result = thread.execute();

                if (!result.done && result.instruction) {
                    this.executeInstruction(thread, result.instruction);
                }

                if (result.done || thread.isComplete()) {
                    core.releaseThread();
                    this.moveToTerminated(thread);
                } else if (this.scheduler.shouldPreempt(thread)) {
                    const preemptedThread = core.releaseThread();
                    preemptedThread.quantum = 0;
                    this.moveToReady(preemptedThread);
                    this.log(`Thread ${preemptedThread.name} preempted`, 'info');
                }
            }
        });

        if (this.threadingModel === 'many-to-one') {
            const availableCores = this.cpuCores.filter(core => core.isIdle);
            if (availableCores.length > 1) {
                for (let i = 1; i < availableCores.length; i++) {
                    availableCores[i].isIdle = true;
                }
            }
        }

        this.cpuCores.forEach(core => {
            if (core.isIdle && this.readyQueue.length > 0) {
                const thread = this.scheduler.selectNextThread(this.readyQueue);
                if (thread) {
                    thread.quantum = 0;
                    core.assignThread(thread);
                    this.log(`Thread ${thread.name} assigned to Core ${core.id}`, 'info');
                }
            }
        });
    }

    executeInstruction(thread, instruction) {
        switch (instruction.type) {
            case 'compute':
                break;

            case 'wait':
                const semaphore = this.semaphores.get(instruction.resource);
                if (semaphore) {
                    if (!semaphore.wait(thread)) {
                        const core = this.cpuCores.find(c => c.currentThread === thread);
                        if (core) {
                            core.releaseThread();
                        }
                        this.moveToBlocked(thread, `Waiting on semaphore ${semaphore.name}`);
                    } else {
                        this.log(`Thread ${thread.name} acquired semaphore ${semaphore.name}`, 'success');
                    }
                }
                break;

            case 'signal':
                const signalSem = this.semaphores.get(instruction.resource);
                if (signalSem) {
                    const unblockedThread = signalSem.signal();
                    if (unblockedThread) {
                        const index = this.blockedQueue.indexOf(unblockedThread);
                        if (index > -1) {
                            this.blockedQueue.splice(index, 1);
                        }
                        this.moveToReady(unblockedThread);
                        this.log(`Thread ${unblockedThread.name} unblocked by ${thread.name}`, 'success');
                    }
                    this.log(`Thread ${thread.name} signaled semaphore ${signalSem.name}`, 'info');
                }
                break;

            case 'enter-monitor':
                const monitor = this.monitors.get(instruction.resource);
                if (monitor) {
                    if (!monitor.enter(thread)) {
                        const core = this.cpuCores.find(c => c.currentThread === thread);
                        if (core) {
                            core.releaseThread();
                        }
                        this.moveToBlocked(thread, `Waiting to enter monitor ${monitor.name}`);
                    } else {
                        this.log(`Thread ${thread.name} entered monitor ${monitor.name}`, 'success');
                    }
                }
                break;

            case 'exit-monitor':
                const exitMonitor = this.monitors.get(instruction.resource);
                if (exitMonitor) {
                    const result = exitMonitor.exit();
                    if (result.nextThread) {
                        const index = this.blockedQueue.indexOf(result.nextThread);
                        if (index > -1) {
                            this.blockedQueue.splice(index, 1);
                        }
                        this.moveToReady(result.nextThread);
                        this.log(`Thread ${result.nextThread.name} entered monitor ${exitMonitor.name}`, 'success');
                    }
                    this.log(`Thread ${thread.name} exited monitor ${exitMonitor.name}`, 'info');
                }
                break;

            case 'monitor-wait':
                const waitMonitor = this.monitors.get(instruction.resource);
                if (waitMonitor) {
                    const result = waitMonitor.wait(thread);
                    if (result.currentBlocked) {
                        const core = this.cpuCores.find(c => c.currentThread === thread);
                        if (core) {
                            core.releaseThread();
                        }
                        this.moveToBlocked(thread, `Waiting on condition in monitor ${waitMonitor.name}`);
                    }
                    if (result.nextThread) {
                        const index = this.blockedQueue.indexOf(result.nextThread);
                        if (index > -1) {
                            this.blockedQueue.splice(index, 1);
                        }
                        this.moveToReady(result.nextThread);
                    }
                }
                break;

            case 'monitor-signal':
                const signalMonitor = this.monitors.get(instruction.resource);
                if (signalMonitor) {
                    const unblockedThread = signalMonitor.signal();
                    if (unblockedThread) {
                        const index = this.blockedQueue.indexOf(unblockedThread);
                        if (index > -1) {
                            this.blockedQueue.splice(index, 1);
                        }
                        this.moveToReady(unblockedThread);
                        this.log(`Thread ${unblockedThread.name} signaled in monitor ${signalMonitor.name}`, 'success');
                    }
                }
                break;
        }
    }

    log(message, level = 'info') {
        this.eventLog.push({
            tick: this.clockTick,
            message,
            level,
            timestamp: new Date().toLocaleTimeString()
        });
    }

    getStatistics() {
        const activeThreads = this.threads.length - this.terminatedThreads.length;
        const totalBusyTime = this.cpuCores.reduce((sum, core) => sum + core.totalBusyTime, 0);
        const totalCoreTime = this.clockTick * this.cpuCores.length;
        const cpuUtilization = totalCoreTime > 0 ? (totalBusyTime / totalCoreTime * 100).toFixed(1) : 0;

        let avgWaitTime = 0;
        let avgTurnaround = 0;
        if (this.terminatedThreads.length > 0) {
            avgWaitTime = (this.terminatedThreads.reduce((sum, t) => sum + t.waitTime, 0) / this.terminatedThreads.length).toFixed(1);
            avgTurnaround = (this.terminatedThreads.reduce((sum, t) => sum + t.turnaroundTime, 0) / this.terminatedThreads.length).toFixed(1);
        }

        return {
            clockTicks: this.clockTick,
            activeThreads,
            completedThreads: this.terminatedThreads.length,
            cpuUtilization: `${cpuUtilization}%`,
            avgWaitTime,
            avgTurnaround
        };
    }
}

class UIManager {
    constructor(engine) {
        this.engine = engine;
        this.autoScroll = true;
    }

    updateAll() {
        this.updateThreadStates();
        this.updateCPUCores();
        this.updateSynchronization();
        this.updateEventLog();
        this.updateStatistics();
    }

    updateThreadStates() {
        const newThreadsContainer = document.getElementById('newThreads');
        const readyThreadsContainer = document.getElementById('readyThreads');
        const blockedThreadsContainer = document.getElementById('blockedThreads');
        const terminatedThreadsContainer = document.getElementById('terminatedThreads');

        newThreadsContainer.innerHTML = '';
        readyThreadsContainer.innerHTML = '';
        blockedThreadsContainer.innerHTML = '';
        terminatedThreadsContainer.innerHTML = '';

        this.engine.threads.forEach(thread => {
            const threadEl = this.createThreadElement(thread);

            switch (thread.state) {
                case 'NEW':
                    newThreadsContainer.appendChild(threadEl);
                    break;
                case 'READY':
                    readyThreadsContainer.appendChild(threadEl);
                    break;
                case 'BLOCKED':
                    blockedThreadsContainer.appendChild(threadEl);
                    break;
                case 'TERMINATED':
                    terminatedThreadsContainer.appendChild(threadEl);
                    break;
            }
        });
    }

    createThreadElement(thread) {
        const div = document.createElement('div');
        div.className = `thread-item state-${thread.state.toLowerCase()}`;

        const progress = thread.burstTime > 0 ?
            Math.round(((thread.burstTime - thread.remainingTime) / thread.burstTime) * 100) : 0;

        div.innerHTML = `
            <div class="thread-name">${thread.name}</div>
            <div class="thread-info">
                <span>P: ${thread.priority}</span>
                <span>Remaining: ${thread.remainingTime}</span>
                <span>${progress}%</span>
            </div>
        `;

        return div;
    }

    updateCPUCores() {
        const container = document.getElementById('cpuCoresContainer');
        container.innerHTML = '';

        this.engine.cpuCores.forEach(core => {
            const coreEl = document.createElement('div');
            coreEl.className = 'cpu-core';

            const status = core.isIdle ? 'IDLE' : 'BUSY';
            const statusClass = core.isIdle ? 'cpu-idle' : 'cpu-busy';

            let threadInfo = '<div class="cpu-thread-info">No thread assigned</div>';
            let progressBar = '';

            if (!core.isIdle && core.currentThread) {
                const thread = core.currentThread;
                const progress = thread.burstTime > 0 ?
                    Math.round(((thread.burstTime - thread.remainingTime) / thread.burstTime) * 100) : 0;

                threadInfo = `
                    <div class="cpu-thread-info">
                        <strong>${thread.name}</strong> | Priority: ${thread.priority} |
                        Progress: ${thread.currentInstruction}/${thread.burstTime}
                    </div>
                `;

                progressBar = `
                    <div class="cpu-progress">
                        <div class="progress-bar">
                            <div class="progress-fill" style="width: ${progress}%">${progress}%</div>
                        </div>
                    </div>
                `;
            }

            coreEl.innerHTML = `
                <div class="cpu-core-header">
                    <span class="cpu-core-name">Core ${core.id}</span>
                    <span class="cpu-core-status ${statusClass}">${status}</span>
                </div>
                ${threadInfo}
                ${progressBar}
            `;

            container.appendChild(coreEl);
        });
    }

    updateSynchronization() {
        const semaphoresList = document.getElementById('semaphoresList');
        const monitorsList = document.getElementById('monitorsList');

        semaphoresList.innerHTML = '';
        this.engine.semaphores.forEach(semaphore => {
            const semEl = document.createElement('div');
            semEl.className = 'sync-item';

            const queueInfo = semaphore.waitQueue.length > 0 ?
                `Waiting: ${semaphore.waitQueue.map(t => t.name).join(', ')}` : 'No threads waiting';

            semEl.innerHTML = `
                <div class="sync-header">
                    <span class="sync-name">${semaphore.name}</span>
                    <span class="sync-value">${semaphore.value}</span>
                </div>
                <div class="sync-queue">${queueInfo}</div>
            `;
            semaphoresList.appendChild(semEl);
        });

        monitorsList.innerHTML = '';
        this.engine.monitors.forEach(monitor => {
            const monEl = document.createElement('div');
            monEl.className = 'sync-item';

            const ownerInfo = monitor.owner ? `Owner: ${monitor.owner.name}` : 'Available';
            const entryQueue = monitor.entryQueue.length > 0 ?
                `Entry: ${monitor.entryQueue.map(t => t.name).join(', ')}` : '';
            const condQueue = monitor.conditionQueue.length > 0 ?
                `Condition: ${monitor.conditionQueue.map(t => t.name).join(', ')}` : '';

            monEl.innerHTML = `
                <div class="sync-header">
                    <span class="sync-name">${monitor.name}</span>
                    <span class="sync-value">${monitor.owner ? 'LOCKED' : 'FREE'}</span>
                </div>
                <div class="sync-queue">${ownerInfo}</div>
                ${entryQueue ? `<div class="sync-queue">${entryQueue}</div>` : ''}
                ${condQueue ? `<div class="sync-queue">${condQueue}</div>` : ''}
            `;
            monitorsList.appendChild(monEl);
        });
    }

    updateEventLog() {
        const logContainer = document.getElementById('eventLog');
        const shouldScroll = this.autoScroll &&
            (logContainer.scrollHeight - logContainer.scrollTop - logContainer.clientHeight < 50);

        const recentLogs = this.engine.eventLog.slice(-100);

        if (this.lastLogCount !== recentLogs.length) {
            const newLogs = recentLogs.slice(this.lastLogCount || 0);

            newLogs.forEach(log => {
                const logEl = document.createElement('div');
                logEl.className = `log-entry log-${log.level}`;
                logEl.innerHTML = `
                    <span class="log-time">[${log.tick}] ${log.timestamp}</span>
                    ${log.message}
                `;
                logContainer.appendChild(logEl);
            });

            this.lastLogCount = recentLogs.length;
        }

        if (shouldScroll) {
            logContainer.scrollTop = logContainer.scrollHeight;
        }
    }

    updateStatistics() {
        const stats = this.engine.getStatistics();

        document.getElementById('clockTicks').textContent = stats.clockTicks;
        document.getElementById('activeThreads').textContent = stats.activeThreads;
        document.getElementById('completedThreads').textContent = stats.completedThreads;
        document.getElementById('cpuUtilization').textContent = stats.cpuUtilization;
        document.getElementById('avgWaitTime').textContent = stats.avgWaitTime;
        document.getElementById('avgTurnaround').textContent = stats.avgTurnaround;
    }

    clearLog() {
        document.getElementById('eventLog').innerHTML = '';
        this.lastLogCount = 0;
        this.engine.eventLog = [];
    }
}

class DemoScenarios {
    static producerConsumer(engine) {
        engine.reset();
        engine.initialize(2, 'round-robin', 3, 'one-to-one');

        const buffer = engine.addSemaphore('buffer', 1);
        const empty = engine.addSemaphore('empty', 5);
        const full = engine.addSemaphore('full', 0);

        const producer = new Thread('Producer', 7, [
            { type: 'wait', resource: 'empty' },
            { type: 'wait', resource: 'buffer' },
            { type: 'compute' },
            { type: 'compute' },
            { type: 'signal', resource: 'buffer' },
            { type: 'signal', resource: 'full' },
            { type: 'wait', resource: 'empty' },
            { type: 'wait', resource: 'buffer' },
            { type: 'compute' },
            { type: 'compute' },
            { type: 'signal', resource: 'buffer' },
            { type: 'signal', resource: 'full' }
        ]);

        const consumer = new Thread('Consumer', 6, [
            { type: 'wait', resource: 'full' },
            { type: 'wait', resource: 'buffer' },
            { type: 'compute' },
            { type: 'compute' },
            { type: 'signal', resource: 'buffer' },
            { type: 'signal', resource: 'empty' },
            { type: 'wait', resource: 'full' },
            { type: 'wait', resource: 'buffer' },
            { type: 'compute' },
            { type: 'compute' },
            { type: 'signal', resource: 'buffer' },
            { type: 'signal', resource: 'empty' }
        ]);

        engine.addThread(producer);
        engine.addThread(consumer);

        engine.log('Producer-Consumer scenario loaded', 'success');
    }

    static diningPhilosophers(engine) {
        engine.reset();
        engine.initialize(3, 'priority', 3, 'one-to-one');

        for (let i = 0; i < 5; i++) {
            engine.addSemaphore(`fork${i}`, 1);
        }

        for (let i = 0; i < 5; i++) {
            const leftFork = `fork${i}`;
            const rightFork = `fork${(i + 1) % 5}`;

            const philosopher = new Thread(`Philosopher${i}`, 5 + i, [
                { type: 'compute' },
                { type: 'wait', resource: leftFork },
                { type: 'wait', resource: rightFork },
                { type: 'compute' },
                { type: 'compute' },
                { type: 'compute' },
                { type: 'signal', resource: rightFork },
                { type: 'signal', resource: leftFork },
                { type: 'compute' },
                { type: 'compute' }
            ]);

            engine.addThread(philosopher);
        }

        engine.log('Dining Philosophers scenario loaded', 'success');
    }

    static readersWriters(engine) {
        engine.reset();
        engine.initialize(2, 'priority', 3, 'one-to-one');

        const monitor = engine.addMonitor('database');
        const readCount = engine.addSemaphore('readCount', 1);

        const writer1 = new Thread('Writer1', 8, [
            { type: 'enter-monitor', resource: 'database' },
            { type: 'compute' },
            { type: 'compute' },
            { type: 'compute' },
            { type: 'exit-monitor', resource: 'database' },
            { type: 'compute' }
        ]);

        const reader1 = new Thread('Reader1', 6, [
            { type: 'wait', resource: 'readCount' },
            { type: 'enter-monitor', resource: 'database' },
            { type: 'signal', resource: 'readCount' },
            { type: 'compute' },
            { type: 'compute' },
            { type: 'wait', resource: 'readCount' },
            { type: 'exit-monitor', resource: 'database' },
            { type: 'signal', resource: 'readCount' }
        ]);

        const reader2 = new Thread('Reader2', 6, [
            { type: 'wait', resource: 'readCount' },
            { type: 'enter-monitor', resource: 'database' },
            { type: 'signal', resource: 'readCount' },
            { type: 'compute' },
            { type: 'compute' },
            { type: 'wait', resource: 'readCount' },
            { type: 'exit-monitor', resource: 'database' },
            { type: 'signal', resource: 'readCount' }
        ]);

        const writer2 = new Thread('Writer2', 9, [
            { type: 'enter-monitor', resource: 'database' },
            { type: 'compute' },
            { type: 'compute' },
            { type: 'exit-monitor', resource: 'database' }
        ]);

        engine.addThread(writer1);
        engine.addThread(reader1);
        engine.addThread(reader2);
        engine.addThread(writer2);

        engine.log('Readers-Writers scenario loaded', 'success');
    }
}

const engine = new SimulationEngine();
const ui = new UIManager(engine);
let simulationInterval = null;

function initializeSimulation() {
    const numCores = parseInt(document.getElementById('cpuCores').value);
    const schedulingAlgo = document.getElementById('schedulingAlgo').value;
    const timeQuantum = parseInt(document.getElementById('timeQuantum').value);
    const threadingModel = document.getElementById('threadingModel').value;

    engine.initialize(numCores, schedulingAlgo, timeQuantum, threadingModel);
    ui.updateAll();
}

function startSimulation() {
    if (!engine.isRunning) {
        engine.isRunning = true;
        document.getElementById('startBtn').disabled = true;
        document.getElementById('pauseBtn').disabled = false;
        document.getElementById('stepBtn').disabled = true;

        simulationInterval = setInterval(() => {
            engine.tick();
            ui.updateAll();

            const allComplete = engine.threads.length > 0 &&
                engine.threads.every(t => t.state === 'TERMINATED');

            if (allComplete) {
                pauseSimulation();
                engine.log('All threads completed', 'success');
            }
        }, 500);
    }
}

function pauseSimulation() {
    engine.isRunning = false;
    document.getElementById('startBtn').disabled = false;
    document.getElementById('pauseBtn').disabled = true;
    document.getElementById('stepBtn').disabled = false;

    if (simulationInterval) {
        clearInterval(simulationInterval);
        simulationInterval = null;
    }
}

function resetSimulation() {
    pauseSimulation();
    initializeSimulation();
    ui.clearLog();
}

function stepSimulation() {
    engine.tick();
    ui.updateAll();
}

function addCustomThread() {
    const priority = parseInt(document.getElementById('threadPriority').value);

    const instructions = [
        { type: 'compute' },
        { type: 'compute' },
        { type: 'compute' },
        { type: 'compute' },
        { type: 'compute' }
    ];

    const thread = new Thread(null, priority, instructions);
    engine.addThread(thread);
    ui.updateAll();
}

function addSemaphore() {
    const name = `Sem${engine.semaphores.size + 1}`;
    engine.addSemaphore(name, 1);
    ui.updateAll();
}

function addMonitor() {
    const name = `Mon${engine.monitors.size + 1}`;
    engine.addMonitor(name);
    ui.updateAll();
}

document.getElementById('startBtn').addEventListener('click', startSimulation);
document.getElementById('pauseBtn').addEventListener('click', pauseSimulation);
document.getElementById('resetBtn').addEventListener('click', resetSimulation);
document.getElementById('stepBtn').addEventListener('click', stepSimulation);
document.getElementById('addThreadBtn').addEventListener('click', addCustomThread);
document.getElementById('addSemaphoreBtn').addEventListener('click', addSemaphore);
document.getElementById('addMonitorBtn').addEventListener('click', addMonitor);
document.getElementById('clearLogBtn').addEventListener('click', () => ui.clearLog());

document.getElementById('cpuCores').addEventListener('change', initializeSimulation);
document.getElementById('schedulingAlgo').addEventListener('change', (e) => {
    const quantumControl = document.getElementById('quantumControl');
    quantumControl.style.display = e.target.value === 'round-robin' ? 'block' : 'none';
    initializeSimulation();
});
document.getElementById('timeQuantum').addEventListener('change', initializeSimulation);
document.getElementById('threadingModel').addEventListener('change', initializeSimulation);

document.getElementById('autoScrollLog').addEventListener('change', (e) => {
    ui.autoScroll = e.target.checked;
});

document.getElementById('producerConsumerBtn').addEventListener('click', () => {
    DemoScenarios.producerConsumer(engine);
    ui.updateAll();
});

document.getElementById('diningPhilosophersBtn').addEventListener('click', () => {
    DemoScenarios.diningPhilosophers(engine);
    ui.updateAll();
});

document.getElementById('readersWritersBtn').addEventListener('click', () => {
    DemoScenarios.readersWriters(engine);
    ui.updateAll();
});

document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const tabName = e.target.dataset.tab;

        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

        e.target.classList.add('active');
        document.getElementById(`${tabName}Tab`).classList.add('active');
    });
});

window.addEventListener('load', () => {
    initializeSimulation();
});
