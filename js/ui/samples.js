/**
 * Standard 8086 Assembly Program Samples
 */

const SAMPLES = {
    "flag_addition_demo": {
        name: "Addition & 6 Status Flags (OF, ZF, SF, CF, AF, PF)",
        desc: "Adds 94C2H + 323EH and traces all 6 status flags (OF=0, ZF=0, SF=1, CF=0, AF=1, PF=1)",
        code: `; ==========================================
; 8086 Flag Calculation & Tracing
; ==========================================
.model small
.stack 100h
.code

; Line 1: Load 94C2H into AX
MOV AX, 94C2H

; Line 2: Load 323EH into BX
MOV BX, 323EH

; Line 3: Add BX to AX (AX = AX + BX)
; 94C2H + 323EH = C700H
; Status Flags: SF=1 (negative), ZF=0, CF=0, AF=1 (nibble carry), PF=1, OF=0
ADD AX, BX

; Line 4: Copy AX to DX
MOV DX, AX

; Line 5: Copy DX to CX
MOV CX, DX

HLT
`
    },

    "little_endian_demo": {
        name: "Little-Endian Memory Storage (Word & DWord)",
        desc: "Stores 1234H and 00567CFFH in memory demonstrating Little-Endian byte ordering",
        code: `; ==========================================
; Memory Organization: Little-Endian Storage
; Low byte stored at lower address, High byte at higher
; ==========================================
.model small
.data
; Data defined in Little-Endian format
WORD1  DW 1234H
DWORD1 DD 00567CFFH

.code
MOV AX, @data
MOV DS, AX

; Reading back from memory into registers
MOV BX, WORD1        ; Low byte (34h) in BL, High byte (12h) in BH
MOV CX, [0000H]      ; Direct read of WORD1

HLT
`
    },

    "addressing_modes_all": {
        name: "The 7 Data Addressing Modes",
        desc: "Demonstrates each of the 7 Data Addressing Modes of the 8086",
        code: `; ==========================================
; The 7 Data Addressing Modes of Intel 8086
; ==========================================
.model small
.data
ARRAY  DW 1111H, 2222H, 3333H, 4444H

.code
MOV AX, @data
MOV DS, AX

; 1. Register Addressing (Register to Register)
MOV CX, 5555H
MOV BX, CX

; 2. Immediate Addressing (Constant to Register)
MOV CH, 3AH

; 3. Direct Addressing (Offset directly in instruction)
MOV AX, [0000H]

; 4. Register Indirect Addressing (Offset in BX, BP, SI, or DI)
MOV BX, 0002H
MOV DX, [BX]

; 5. Base-Plus-Index Addressing ([BX+SI] or [BX+DI])
MOV SI, 0002H
MOV AX, [BX+SI]

; 6. Register Relative Addressing ([BX + Disp])
MOV AX, [BX+2]

; 7. Base Relative-Plus-Index Addressing ([BX+SI + Disp])
MOV AX, [BX+SI+2]

HLT
`
    },

    "led_counter": {
        name: "Hardware Demo: LED Binary Counter (Port 2)",
        desc: "Outputs binary counter values to Port 2 (LEDs)",
        code: `; ==========================================
; Hardware Demo: 8-bit LED Counter
; Outputs counter values to Port 2
; ==========================================
.model small
.code

MOV AL, 00H       ; Start counter at 0

COUNT_LOOP:
OUT 2, AL         ; Output to Port 2 (LEDs)
INC AL            ; Next value
CMP AL, 10H       ; Count first 16 values
JNE COUNT_LOOP

HLT
`
    },

    "seven_seg_demo": {
        name: "Hardware Demo: 7-Segment Hex Display (Port 3)",
        desc: "Displays hex digits 0 to F on the 7-segment display via Port 3",
        code: `; ==========================================
; Hardware Demo: 7-Segment Hex Counter
; Outputs hex nibble to Port 3
; ==========================================
.model small
.code

MOV AL, 00H

DIGIT_LOOP:
OUT 3, AL         ; Send digit (0-F) to 7-Segment
INC AL
CMP AL, 10H
JNE DIGIT_LOOP

HLT
`
    },

    "loop_instruction": {
        name: "LOOP Instruction & Automatic CX Decrement",
        desc: "Uses CX register with LOOP instruction to decrement CX and branch",
        code: `; ==========================================
; LOOP Instruction Demo
; CX acts as counter (decremented automatically)
; ==========================================
.model small
.code

MOV CX, 05H       ; Count = 5
MOV AX, 00H       ; Accumulator = 0

REPEAT_ADD:
ADD AX, 10H       ; Add 16 to AX
LOOP REPEAT_ADD   ; Dec CX, if CX != 0 jump to REPEAT_ADD

HLT
`
    },

    "syntax_error_test": {
        name: "Syntax Error Test (Demo Red Flag 🚩 & Corrector)",
        desc: "Code with intentional common mistakes to demonstrate the Red Flag corrector",
        code: `; ==========================================
; Intentional Mistakes to Test Red Flag 🚩
; ==========================================
.model small
.code

; Error 1: Typo in mnemonic (MOVE instead of MOV)
MOVE AX, 1234H

; Error 2: Operand size mismatch (AX is 16-bit, BL is 8-bit)
MOV AX, BL

; Error 3: Constant as destination (cannot store into 50)
MOV 50, BX

; Error 4: Illegal register inside memory brackets ([CX] is illegal in 8086)
MOV DX, [CX]

; Error 5: 8-bit register overflow (500 doesn't fit in AL)
MOV AL, 500

HLT
`
    },

    "hello_terminal": {
        name: "DOS INT 21h: Print String to Terminal",
        desc: "Prints a string ending with $ using DOS Interrupt 21h, AH=09h",
        code: `; ==========================================
; DOS Interrupt INT 21h / AH=09h
; ==========================================
.model small
.data
MSG DB 'Welcome to 8086 Microprocessor Simulator!$', 0

.code
MOV AX, @data
MOV DS, AX

MOV DX, offset MSG ; Load string offset into DX
MOV AH, 09H        ; DOS function: print string
INT 21H

MOV AH, 4CH        ; DOS exit
INT 21H
`
    }
};

if (typeof window !== 'undefined') window.SAMPLES = SAMPLES;
if (typeof module !== 'undefined') module.exports = SAMPLES;
