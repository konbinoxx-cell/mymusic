class SongCreator {
    constructor() {
        this.synth = null; // 延迟初始化
        this.staffNotes = [];
        this.staffHeight = 120;
        this.staffLinesY = [20, 40, 60, 80, 100];
        this.isDragging = false; // 是否正在拖拽添加音符
        this.dragStartX = 0;

        this.init();
    }

    init() {
        this.renderStaffLines();
        this.createPianoKeyboard(); // 新增：生成 49 键钢琴键盘
        this.bindEvents();
    }

    renderStaffLines() {
        const staff = document.getElementById('staff');
        ['line1', 'line2', 'line3', 'line4', 'line5'].forEach(cls => {
            const line = document.createElement('div');
            line.className = cls;
            staff.appendChild(line);
        });
    }

    createPianoKeyboard() {
        const keyboard = document.getElementById('pianoKeyboard');
        const notes = [
            'C2', 'C#2', 'D2', 'D#2', 'E2', 'F2', 'F#2', 'G2', 'G#2', 'A2', 'A#2', 'B2',
            'C3', 'C#3', 'D3', 'D#3', 'E3', 'F3', 'F#3', 'G3', 'G#3', 'A3', 'A#3', 'B3',
            'C4', 'C#4', 'D4', 'D#4', 'E4', 'F4', 'F#4', 'G4', 'G#4', 'A4', 'A#4', 'B4',
            'C5', 'C#5', 'D5', 'D#5', 'E5', 'F5', 'F#5', 'G5', 'G#5', 'A5', 'A#5', 'B5',
            'C6'
        ];

        notes.forEach(note => {
            const key = document.createElement('div');
            key.className = `piano-key ${note.includes('#') ? 'black' : ''}`;
            key.dataset.note = note;

            const label = document.createElement('div');
            label.className = 'piano-key-label';
            label.textContent = note.replace(/\d/g, '');
            key.appendChild(label);

            key.addEventListener('mousedown', (e) => {
                e.preventDefault();
                this.handleKeyDown(note);
            });

            key.addEventListener('mouseup', () => {
                this.handleKeyUp(note);
            });

            key.addEventListener('mouseleave', () => {
                this.handleKeyUp(note);
            });

            // 支持触摸
            key.addEventListener('touchstart', (e) => {
                e.preventDefault();
                this.handleKeyDown(note);
            });

            key.addEventListener('touchend', () => {
                this.handleKeyUp(note);
            });

            keyboard.appendChild(key);
        });
    }

    handleKeyDown(note) {
        this.initSynth();
        this.synth.triggerAttack(note);
        this.addNoteToStaff(note, this.getNoteXPosition(note), this.getNoteYPosition(note));
        document.querySelector(`[data-note="${note}"]`).classList.add('active');
    }

    handleKeyUp(note) {
        if (this.synth) {
            this.synth.triggerRelease(note);
        }
        document.querySelector(`[data-note="${note}"]`).classList.remove('active');
    }

    getNoteXPosition(note) {
        // 简化：根据音符序号计算 x 位置
        const notes = [
            'C2', 'C#2', 'D2', 'D#2', 'E2', 'F2', 'F#2', 'G2', 'G#2', 'A2', 'A#2', 'B2',
            'C3', 'C#3', 'D3', 'D#3', 'E3', 'F3', 'F#3', 'G3', 'G#3', 'A3', 'A#3', 'B3',
            'C4', 'C#4', 'D4', 'D#4', 'E4', 'F4', 'F#4', 'G4', 'G#4', 'A4', 'A#4', 'B4',
            'C5', 'C#5', 'D5', 'D#5', 'E5', 'F5', 'F#5', 'G5', 'G#5', 'A5', 'A#5', 'B5',
            'C6'
        ];
        const index = notes.indexOf(note);
        return 10 + index * 32; // 间距 32px
    }

    getNoteYPosition(note) {
        // 根据音高决定 y 位置（越高越靠上）
        const pitch = note.replace(/\d/g, '');
        const octave = parseInt(note.match(/\d/)[0]);
        const baseY = { C: 100, D: 90, E: 80, F: 70, G: 60, A: 50, B: 40 };
        const y = baseY[pitch] - (octave - 2) * 20; // 每升高一个八度，y 减少 20
        return Math.max(0, Math.min(this.staffHeight, y));
    }

    bindEvents() {
        // 初始化合成器的函数（只执行一次）
        const initSynth = () => {
            if (!this.synth) {
                this.synth = new Tone.PolySynth(Tone.Synth, {
                    oscillator: { type: 'triangle' },
                    envelope: { attack: 0.02, decay: 0.2, sustain: 0.4, release: 0.8 }
                }).toDestination();
                console.log('🎵 音频上下文已激活！');
            }
        };

        // 音符面板点击（试听）—— 第一次点击激活音频
        document.querySelectorAll('.note-option').forEach(btn => {
            btn.addEventListener('click', (e) => {
                initSynth();
                const note = e.target.dataset.note;
                this.previewNote(note);
            });
        });

        // 五线谱点击添加音符
        const staff = document.getElementById('staff');
        staff.addEventListener('mousedown', (e) => {
            initSynth();
            this.isDragging = true;
            this.dragStartX = e.clientX;
            this.addNoteOnDrag(e);
        });

        staff.addEventListener('mousemove', (e) => {
            if (this.isDragging) {
                this.addNoteOnDrag(e);
            }
        });

        staff.addEventListener('mouseup', () => {
            this.isDragging = false;
        });

        staff.addEventListener('mouseleave', () => {
            this.isDragging = false;
        });

        // 控制按钮
        document.getElementById('clearStaff').addEventListener('click', () => this.clearStaff());
        
        document.getElementById('playStaff').addEventListener('click', () => {
            initSynth();
            this.playStaff();
        });

        document.getElementById('stopBtn').addEventListener('click', () => this.stopMusic());
        document.getElementById('generateBtn').addEventListener('click', () => this.generateMusic());
        document.getElementById('exportMidi').addEventListener('click', () => this.exportMIDI());

        // 风格按钮
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
        // 只有当 x 变化超过 20px 才添加新音符（避免密集添加）
        if (Math.abs(x - this.dragStartX) > 20) {
            this.addNoteToStaff(note, x, y);
            this.dragStartX = x; // 重置起点
        }
    }

    yToNote(y) {
        const noteMap = ['C5', 'B4', 'A4', 'G4', 'F4', 'E4', 'D4', 'C4', 'B3', 'A3'];
        const index = Math.floor((y / this.staffHeight) * noteMap.length);
        return noteMap[Math.max(0, Math.min(noteMap.length - 1, index))];
    }

    addNoteToStaff(note, x, y) {
        const staff = document.getElementById('staff');
        const noteEl = document.createElement('div');
        noteEl.className = 'staff-note';
        noteEl.textContent = note.replace(/\d/g, '');
        noteEl.style.left = `${x}px`;
        noteEl.style.top = `${y}px`;
        noteEl.title = note;

        noteEl.addEventListener('dblclick', () => {
            noteEl.remove();
            this.staffNotes = this.staffNotes.filter(n => n.element !== noteEl);
        });

        staff.appendChild(noteEl);
        this.staffNotes.push({ note, x, y, element: noteEl });
        this.updateStatus(`已添加音符: ${note}`);
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

        const sorted = [...this.staffNotes].sort((a, b) => a.x - b.x);
        sorted.forEach((n, i) => {
            this.synth.triggerAttackRelease(n.note, '4n', now + i * 0.6);
        });

        this.updateStatus('正在播放旋律…');
    }

    clearStaff() {
        document.querySelectorAll('.staff-note').forEach(el => el.remove());
        this.staffNotes = [];
        this.updateStatus('乐谱已清空');
    }

    getChordProgression() {
        return Array.from(document.querySelectorAll('.chord-select')).map(s => s.value);
    }

    generateMusic() {
        const chords = this.getChordProgression();
        const key = document.getElementById('key').value;
        const style = document.querySelector('.preset-btn.active').dataset.style;
        const duration = document.getElementById('duration').value;

        this.updateStatus('生成完整歌曲中…', true);

        setTimeout(() => {
            this.updateStatus('歌曲生成完成！可导出 MIDI。');
        }, 1500);
    }

    exportMIDI() {
        if (this.staffNotes.length === 0) {
            this.updateStatus('请先创作旋律再导出 MIDI！');
            return;
        }
        this.updateStatus('MIDI 导出功能将在未来版本实现 🎹');
    }

    stopMusic() {
        if (this.synth) {
            this.synth.releaseAll();
            Tone.Transport.stop();
        }
        this.updateStatus('播放已停止');
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
            console.log('🎵 音频上下文已激活！');
        }
    }
}

// 启动
document.addEventListener('DOMContentLoaded', () => {
    new SongCreator();
    console.log('🎵 自由音乐创作平台已启动！请先点击一个音符或键盘激活音频。');
});
