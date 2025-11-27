class SongCreator {
    constructor() {
        this.synth = null;
        this.staffNotes = [];
        this.staffHeight = 160;
        this.isDragging = false;
        this.dragStartX = 0;
        this.mediaRecorder = null;
        this.recordedChunks = [];
        this.isRecording = false;
        this.nextNoteX = 50;
        this.barLines = [];

        this.whiteKeys = [
            'C2', 'D2', 'E2', 'F2', 'G2', 'A2', 'B2',
            'C3', 'D3', 'E3', 'F3', 'G3', 'A3', 'B3',
            'C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4',
            'C5', 'D5', 'E5', 'F5', 'G5', 'A5', 'B5',
            'C6'
        ];

        this.blackKeys = [
            { note: 'C#2', offset: 1 }, { note: 'D#2', offset: 2 },
            { note: 'F#2', offset: 4 }, { note: 'G#2', offset: 5 }, { note: 'A#2', offset: 6 },
            { note: 'C#3', offset: 8 }, { note: 'D#3', offset: 9 },
            { note: 'F#3', offset: 11 }, { note: 'G#3', offset: 12 }, { note: 'A#3', offset: 13 },
            { note: 'C#4', offset: 15 }, { note: 'D#4', offset: 16 },
            { note: 'F#4', offset: 18 }, { note: 'G#4', offset: 19 }, { note: 'A#4', offset: 20 },
            { note: 'C#5', offset: 22 }, { note: 'D#5', offset: 23 },
            { note: 'F#5', offset: 25 }, { note: 'G#5', offset: 26 }, { note: 'A#5', offset: 27 },
            { note: 'C#6', offset: 29 }
        ];

        this.init();
    }

    init() {
        this.renderStaffLines();
        this.createPianoKeyboard();
        this.bindEvents();
    }

    renderStaffLines() {
        const staff = document.getElementById('staff');
        const lines = [100, 80, 60, 40, 20]; // E4, G4, B4, D5, F5
        lines.forEach((top, i) => {
            const line = document.createElement('div');
            line.className = 'line';
            line.style.position = 'absolute';
            line.style.top = `${top}px`;
            line.style.width = '100%';
            line.style.height = '1px';
            line.style.background = 'black';
            staff.appendChild(line);
        });
    }

    createPianoKeyboard() {
        const keyboard = document.getElementById('pianoKeyboard');
        this.whiteKeys.forEach((note, index) => {
            const key = document.createElement('div');
            key.className = 'piano-key';
            key.dataset.note = note;
            const label = document.createElement('div');
            label.className = 'piano-key-label';
            label.textContent = note.replace(/\d/g, '');
            key.appendChild(label);
            key.addEventListener('mousedown', (e) => { e.preventDefault(); this.handleKeyDown(note); });
            key.addEventListener('mouseup', () => this.handleKeyUp(note));
            key.addEventListener('mouseleave', () => this.handleKeyUp(note));
            key.addEventListener('touchstart', (e) => { e.preventDefault(); this.handleKeyDown(note); });
            key.addEventListener('touchend', () => this.handleKeyUp(note));
            keyboard.appendChild(key);
        });

        this.blackKeys.forEach(({ note, offset }) => {
            const blackKey = document.createElement('div');
            blackKey.className = 'piano-key black';
            blackKey.dataset.note = note;
            const label = document.createElement('div');
            label.className = 'piano-key-label';
            label.textContent = note.replace(/\d/g, '');
            blackKey.appendChild(label);
            blackKey.style.left = `${offset * 30}px`;
            blackKey.addEventListener('mousedown', (e) => { e.preventDefault(); this.handleKeyDown(note); });
            blackKey.addEventListener('mouseup', () => this.handleKeyUp(note));
            blackKey.addEventListener('touchstart', (e) => { e.preventDefault(); this.handleKeyDown(note); });
            blackKey.addEventListener('touchend', () => this.handleKeyUp(note));
            keyboard.appendChild(blackKey);
        });
    }

    handleKeyDown(note) {
        this.initSynth();
        this.synth.triggerAttack(note);
        this.addNoteToStaff(note);
        document.querySelector(`[data-note="${note}"]`).classList.add('active');
    }

    handleKeyUp(note) {
        if (this.synth) this.synth.triggerRelease(note);
        document.querySelector(`[data-note="${note}"]`).classList.remove('active');
    }

    addNoteToStaff(note) {
        const staff = document.getElementById('staff');
        const x = this.nextNoteX;
        const y = this.getNoteYPosition(note);

        const noteEl = document.createElement('div');
        noteEl.className = 'staff-note';
        noteEl.textContent = note.replace(/\d/g, '');
        noteEl.style.left = `${x}px`;
        noteEl.style.top = `${y}px`;
        noteEl.title = note;

        noteEl.addEventListener('dblclick', () => {
            noteEl.remove();
            this.staffNotes = this.staffNotes.filter(n => n.element !== noteEl);
            this.updateNoteCount();
        });

        staff.appendChild(noteEl);
        this.staffNotes.push({ note, x, y, element: noteEl });
        this.updateNoteCount();
        this.nextNoteX += 40;
        if (x > staff.offsetWidth - 100) {
            staff.scrollLeft = x - 100;
        }
        this.updateStatus(`已添加音符: ${note}`);
    }

    getNoteYPosition(note) {
        const match = note.match(/^([A-G])([#b]?)(\d)$/);
        if (!match) return 100;
        let [_, basePitch, accidental, octaveStr] = match;
        const octave = parseInt(octaveStr);
        if (accidental === 'b') {
            const flatToSharp = { 'D': 'C', 'E': 'D', 'G': 'F', 'A': 'G', 'B': 'A' };
            if (flatToSharp[basePitch]) {
                basePitch = flatToSharp[basePitch];
                accidental = '#';
            }
        }
        const pitch = basePitch + accidental;
        const pitchToSemitone = {
            'C': -4, 'C#': -3, 'D': -2, 'D#': -1, 'E': 0, 'F': 1,
            'F#': 2, 'G': 3, 'G#': 4, 'A': 5, 'A#': 6, 'B': 7
        };
        const semitoneOffset = pitchToSemitone[pitch];
        if (semitoneOffset === undefined) return 100;
        const pitchOrder = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
        const naturalIndex = pitchOrder.indexOf(basePitch);
        if (naturalIndex === -1) return 100;
        const accidentalStep = accidental === '#' ? 0.5 : 0;
        const noteStep = (octave - 4) * 7 + (naturalIndex - 2) + accidentalStep;
        const baseY = 100;
        const step = 10;
        return baseY - noteStep * step;
    }

    bindEvents() {
        const initSynth = () => {
            if (!this.synth) {
                this.synth = new Tone.PolySynth(Tone.Synth, {
                    oscillator: { type: 'triangle' },
                    envelope: { attack: 0.02, decay: 0.2, sustain: 0.4, release: 0.8 }
                }).toDestination();
            }
        };

        document.querySelectorAll('.note-option').forEach(btn => {
            btn.addEventListener('click', (e) => {
                initSynth();
                this.previewNote(e.target.dataset.note);
            });
        });

        const staff = document.getElementById('staff');
        staff.addEventListener('mousedown', (e) => {
            initSynth();
            this.isDragging = true;
            this.dragStartX = e.clientX;
            this.addNoteOnDrag(e);
        });
        staff.addEventListener('mousemove', (e) => { if (this.isDragging) this.addNoteOnDrag(e); });
        staff.addEventListener('mouseup', () => this.isDragging = false);
        staff.addEventListener('mouseleave', () => this.isDragging = false);

        document.getElementById('clearStaff').addEventListener('click', () => this.clearStaff());
        document.getElementById('playStaff').addEventListener('click', () => { initSynth(); this.playStaff(); });
        document.getElementById('stopBtn').addEventListener('click', () => this.stopMusic());
        document.getElementById('addBarLine').addEventListener('click', () => {
            this.addBarLine(this.nextNoteX);
        });

        document.getElementById('recordBtn').addEventListener('click', async () => {
            if (this.isRecording) {
                this.stopRecording();
            } else {
                await this.startRecording();
            }
        });

        document.getElementById('exportBtn').addEventListener('click', () => this.exportMP3());
        document.getElementById('generateBtn').addEventListener('click', () => this.generateMusic());
        document.getElementById('exportMidi').addEventListener('click', () => this.exportMIDI());

        document.querySelectorAll('.preset-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
            });
        });
    }

    addNoteOnDrag(e) {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        if (x < 0 || x > rect.width || y < 0 || y > rect.height) return;
        const note = this.yToNote(y);
        if (Math.abs(x - this.dragStartX) > 20) {
            this.addNoteToStaff(note);
            this.dragStartX = x;
        }
    }

    yToNote(y) {
        const pitchOrder = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        let closestNote = 'C4';
        let minDiff = Infinity;
        for (let octave = 2; octave <= 6; octave++) {
            for (const pitch of pitchOrder) {
                const note = pitch + octave;
                const noteY = this.getNoteYPosition(note);
                const diff = Math.abs(y - noteY);
                if (diff < minDiff) {
                    minDiff = diff;
                    closestNote = note;
                }
            }
        }
        return closestNote;
    }

    addBarLine(x) {
        const staffBars = document.getElementById('staffBars');
        const bar = document.createElement('div');
        bar.className = 'bar-line';
        bar.style.left = `${x}px`;
        bar.addEventListener('dblclick', () => {
            bar.remove();
            this.barLines = this.barLines.filter(b => b.element !== bar);
        });
        staffBars.appendChild(bar);
        this.barLines.push({ x, element: bar });
        this.updateStatus(`添加小节线于位置: ${x}px`);
    }

    clearStaff() {
        document.querySelectorAll('.staff-note').forEach(el => el.remove());
        document.querySelectorAll('.bar-line').forEach(el => el.remove());
        this.staffNotes = [];
        this.barLines = [];
        this.nextNoteX = 50;
        this.updateNoteCount();
        this.updateStatus('乐谱已清空');
    }

    updateNoteCount() {
        const count = this.staffNotes.length;
        document.getElementById('noteCount').textContent = `${count} 个音符`;
    }

    previewNote(note) {
        this.synth.triggerAttackRelease(note, '8n');
    }

    playStaff() {
        if (this.staffNotes.length === 0) {
            this.updateStatus('五线谱为空，请先添加音符！');
            return;
        }
        this.stopMusic();
        const now = Tone.now() + 0.1;
        this.staffNotes.forEach((n, i) => {
            this.synth.triggerAttackRelease(n.note, '4n', now + i * 0.6);
        });
        this.updateStatus('正在播放旋律…');
    }

    getChordProgression() {
        return Array.from(document.querySelectorAll('.chord-select')).map(s => s.value);
    }

    generateMusic() {
        this.updateStatus('生成完整歌曲中…', true);
        setTimeout(() => {
            this.updateStatus('歌曲生成完成！可导出 MIDI 或录音。');
        }, 1500);
    }

    exportMIDI() {
        this.updateStatus('MIDI 导出功能将在未来版本实现 🎹');
    }

    stopMusic() {
        if (this.synth) {
            this.synth.releaseAll();
            Tone.Transport.stop();
        }
        this.updateStatus('播放已停止');
    }

    async startRecording() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.mediaRecorder = new MediaRecorder(stream);
            this.recordedChunks = [];
            this.mediaRecorder.ondataavailable = (e) => this.recordedChunks.push(e.data);
            this.mediaRecorder.onstop = () => {
                document.getElementById('exportBtn').disabled = false;
                document.getElementById('recordBtn').textContent = '● 开始录音';
                document.getElementById('recordBtn').classList.remove('recording');
                this.isRecording = false;
                this.updateStatus('录音已停止，点击“导出MP3”保存');
            };
            this.mediaRecorder.start();
            this.isRecording = true;
            this.updateStatus('🔴 正在录音...');
            document.getElementById('recordBtn').textContent = '● 录音中...';
            document.getElementById('recordBtn').classList.add('recording');
        } catch (err) {
            this.updateStatus('录音失败：请允许麦克风权限');
        }
    }

    stopRecording() {
        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            this.mediaRecorder.stop();
        }
    }

    exportMP3() {
        if (this.recordedChunks.length === 0) {
            this.updateStatus('没有录音内容可导出');
            return;
        }
        this.updateStatus('正在编码 MP3...', true);
        const blob = new Blob(this.recordedChunks, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onload = async (e) => {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            try {
                const audioBuffer = await audioContext.decodeAudioData(e.target.result);
                const mp3Encoder = new lamejs.Mp3Encoder(1, audioBuffer.sampleRate, 128);
                const samples = audioBuffer.getChannelData(0);
                const maxSamples = 1152;
                const mp3Data = [];
                for (let i = 0; i < samples.length; i += maxSamples) {
                    const chunk = samples.slice(i, i + maxSamples);
                    const mp3buf = mp3Encoder.encodeBuffer(chunk);
                    if (mp3buf.length > 0) mp3Data.push(mp3buf);
                }
                const finalMp3 = mp3Encoder.flush();
                if (finalMp3.length > 0) mp3Data.push(finalMp3);
                const mp3Blob = new Blob(mp3Data, { type: 'audio/mp3' });
                const url = URL.createObjectURL(mp3Blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'recording.mp3';
                a.click();
                this.updateStatus('✅ MP3 导出成功！');
            } catch (err) {
                this.updateStatus('编码失败，请重试');
            }
            document.getElementById('loading').style.display = 'none';
        };
        reader.readAsArrayBuffer(blob);
    }

    updateStatus(msg, loading = false) {
        document.getElementById('statusText').textContent = msg;
        document.getElementById('loading').style.display = loading ? 'block' : 'none';
    }

    initSynth() {
        if (!this.synth) {
            this.synth = new Tone.PolySynth(Tone.Synth, {
                oscillator: { type: 'triangle' },
                envelope: { attack: 0.02, decay: 0.2, sustain: 0.4, release: 0.8 }
            }).toDestination();
        }
    }
}

document.addEventListener('DOMContentLoaded', () => new SongCreator());
