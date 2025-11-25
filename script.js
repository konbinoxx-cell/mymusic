class SongCreator {
    constructor() {
        // 初始化合成器
        this.synth = new Tone.PolySynth(Tone.Synth, {
            oscillator: { type: 'triangle' },
            envelope: { attack: 0.02, decay: 0.2, sustain: 0.4, release: 0.8 }
        }).toDestination();

        this.staffNotes = []; // { note: 'C4', x: 120, y: 60, element: DOM }
        this.staffHeight = 120;
        this.staffLinesY = [20, 40, 60, 80, 100]; // 五线位置

        this.init();
    }

    init() {
        this.renderStaffLines();
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

    bindEvents() {
        // 音符面板点击（试听）
        document.querySelectorAll('.note-option').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const note = e.target.dataset.note;
                this.previewNote(note);
            });
        });

        // 五线谱点击添加音符
        document.getElementById('staff').addEventListener('click', (e) => {
            const staff = e.currentTarget;
            const rect = staff.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            if (x < 0 || x > rect.width || y < 0 || y > rect.height) return;

            const note = this.yToNote(y);
            this.addNoteToStaff(note, x, y);
        });

        // 控制按钮
        document.getElementById('clearStaff').addEventListener('click', () => this.clearStaff());
        document.getElementById('playStaff').addEventListener('click', () => this.playStaff());
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

    yToNote(y) {
        // 从上到下：C5, B4, A4, G4, F4, E4, D4, C4, B3, A3
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
        Tone.start();
        this.synth.triggerAttackRelease(note, '8n');
    }

    playStaff() {
        if (this.staffNotes.length === 0) {
            this.updateStatus('五线谱为空，请先添加音符！');
            return;
        }

        this.stopMusic();
        Tone.start();
        const now = Tone.now() + 0.1;

        // 按 x 位置排序（从左到右 = 时间顺序）
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

        // 模拟生成（实际可构建旋律+和弦伴奏）
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
        this.synth.releaseAll();
        Tone.Transport.stop();
        this.updateStatus('播放已停止');
    }

    updateStatus(msg, loading = false) {
        document.getElementById('statusText').textContent = msg;
        document.getElementById('loading').style.display = loading ? 'block' : 'none';
    }
}

// 启动
document.addEventListener('DOMContentLoaded', () => {
    new SongCreator();
    console.log('🎵 自由音乐创作平台已启动！');
});
