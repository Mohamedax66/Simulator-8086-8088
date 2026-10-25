/**
 * 8086 Bus Interface Unit (BIU)
 * Responsibilities:
 *  1. Physical Address Generation (Segment * 10H + Offset)
 *  2. Prefetch Queue Management: FIFO Queue (6 Bytes for 8086, 4 Bytes for 8088)
 *  3. Pipelining: Fetches instructions in advance while EU is executing
 *  4. Interfacing with System Buses (Address, Data, Control)
 */

class BusInterfaceUnit {
    constructor(registers, memory, is8086 = true) {
        this.regs = registers;
        this.mem = memory;
        this.is8086 = is8086;
        this.queueCapacity = is8086 ? 6 : 4; // 6 bytes for 8086, 4 for 8088
        this.queue = []; // FIFO array of bytes: { byte: number, address: number }
        this.prefetchIp = 0; // BIU internal prefetch pointer
        
        // Tracking for visualizer
        this.lastGeneratedAddress = {
            segmentName: 'CS',
            segmentVal: 0x1000,
            offsetVal: 0x0000,
            physicalAddr: 0x10000,
            formula: '1000H * 10H + 0000H = 10000H'
        };

        this.onQueueChange = null;
        this.onAddressCalculated = null;
    }

    setCpuMode(is8086) {
        this.is8086 = is8086;
        this.queueCapacity = is8086 ? 6 : 4;
        this.flushQueue();
    }

    // --- Physical Address Calculation ---
    // Formula from Lecture 2: Physical Address = (Segment * 10H) + Offset
    calculatePhysicalAddress(segmentName, offset) {
        const segVal = this.regs.getReg16(segmentName);
        const physicalAddr = ((segVal << 4) + (offset & 0xFFFF)) & 0xFFFFF;

        this.lastGeneratedAddress = {
            segmentName: segmentName.toUpperCase(),
            segmentVal: segVal,
            offsetVal: offset & 0xFFFF,
            physicalAddr: physicalAddr,
            formula: `${segVal.toString(16).toUpperCase()}H * 10H + ${(offset & 0xFFFF).toString(16).toUpperCase()}H = ${physicalAddr.toString(16).toUpperCase()}H`
        };

        if (this.onAddressCalculated) this.onAddressCalculated(this.lastGeneratedAddress);
        return physicalAddr;
    }

    // --- Prefetch Queue (FIFO) ---
    // Refill the queue from memory ahead of execution
    fillQueue() {
        while (this.queue.length < this.queueCapacity) {
            const pa = this.calculatePhysicalAddress('cs', this.prefetchIp);
            const byteVal = this.mem.data[pa] || 0x90; // NOP (0x90) if empty
            
            this.queue.push({
                byte: byteVal,
                address: pa,
                ip: this.prefetchIp
            });

            this.prefetchIp = (this.prefetchIp + 1) & 0xFFFF;
        }

        if (this.onQueueChange) this.onQueueChange([...this.queue]);
    }

    // Pop the next instruction byte from the FIFO queue
    popQueueByte() {
        if (this.queue.length === 0) {
            this.fillQueue();
        }
        const item = this.queue.shift();
        if (this.onQueueChange) this.onQueueChange([...this.queue]);
        return item ? item.byte : 0;
    }

    // On Branch / JMP / CALL: Queue must be flushed!
    flushQueue(newIp = null) {
        this.queue = [];
        if (newIp !== null) {
            this.prefetchIp = newIp;
        } else {
            this.prefetchIp = this.regs.ip;
        }
        if (this.onQueueChange) this.onQueueChange([]);
    }

    // Data Transfer Window: Reading from Data/Stack/Extra Segment
    readDataByte(segmentName, offset) {
        const pa = this.calculatePhysicalAddress(segmentName, offset);
        return this.mem.readByte(pa);
    }

    writeDataByte(segmentName, offset, val) {
        const pa = this.calculatePhysicalAddress(segmentName, offset);
        this.mem.writeByte(pa, val);
    }

    readDataWord(segmentName, offset) {
        const pa = this.calculatePhysicalAddress(segmentName, offset);
        return this.mem.readWord(pa);
    }

    writeDataWord(segmentName, offset, val) {
        const pa = this.calculatePhysicalAddress(segmentName, offset);
        this.mem.writeWord(pa, val);
    }

    getSnapshot() {
        return {
            queue: [...this.queue],
            lastGeneratedAddress: { ...this.lastGeneratedAddress }
        };
    }

    restoreSnapshot(snap) {
        this.queue = [...snap.queue];
        this.lastGeneratedAddress = { ...snap.lastGeneratedAddress };
        if (this.onQueueChange) this.onQueueChange([...this.queue]);
    }
}

if (typeof window !== 'undefined') window.BusInterfaceUnit = BusInterfaceUnit;
if (typeof module !== 'undefined') module.exports = BusInterfaceUnit;
