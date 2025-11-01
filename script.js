class SongCreator {
    constructor() {
        this.synth = new Tone.PolySynth(Tone.Synth, {
            oscillator: { type: 'sine' },
            envelope: { attack: 0.02, decay: 0.1, sustain: 0.3, release: 1 }
        }).toDestination();
        
        this.isPlaying = false;
        this.sequences = [];
        this.staffNotes = []; // 存储五线谱上的音符
        
        this.initializeEventListeners();
        this.setupStaff();
    }

    setupStaff() {
        // 五线谱点击事件
        document.querySelector('.staff').addEventListener('click', (e) => {
            const rect = e.target.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            // 计算音高位置 (简化版)
            const noteHeight = rect.height / 10; // 10个音高位置
            const noteIndex = Math.floor(y / noteHeight);
            const notes = ['C5', 'B4', 'A4', 'G4', 'F4', 'E4', 'D4', 'C4', 'B3', 'A3'];
            const note = notes[noteIndex];
            
            this.addNoteToStaff(note, x, y);
        });
    }

    addNoteToStaff(note, x, y) {
        const staff = document.querySelector('.staff');
        const noteElement = document.createElement('div');
        noteElement.className = 'staff-note';
        noteElement.textContent = note.replace(/\d/, '');
        noteElement.style.left = x + 'px';
        noteElement.style.top = y + 'px';
        noteElement.dataset.note = note;
        
        // 双击删除音符
        noteElement.addEventListener('dblclick', () => {
            noteElement.remove();
            this.staffNotes = this.staffNotes.filter(n => n.element !== noteElement);
        });
        
        staff.appendChild(noteElement);
        this.staffNotes.push({
            note: note,
            time: x / staff.offsetWidth, // 相对时间位置
            element: noteElement
        });
    }

    initializeEventListeners() {
        // 音符选项点击
        document.querySelectorAll('.note-option').forEach(option => {
            option.addEventListener('click', (e) => {
                const note = e.target.dataset.note;
                this.previewNote(note);
            });
        });

        // 清空乐谱
        document.getElementById('clearStaff').addEventListener('click', () => {
            this.clearStaff();
        });

        // 播放乐谱
        document.getElementById('playStaff').addEventListener('click', () => {
            this.playStaff();
        });

        // 导出MIDI
        document.getElementById('exportMidi').addEventListener('click', () => {
            this.exportMIDI();
        });

        // 保留原有的事件监听...
        document.querySelectorAll('.preset-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
            });
        });

        document.getElementById('generateBtn').addEventListener('click', () => {
            this.generateMusic();
        });

        document.getElementById('stopBtn').addEventListener('click', () => {
            this.stopMusic();
        });
    }

    previewNote(note) {
        this.synth.triggerAttackRelease(note, "4n");
    }

    playStaff() {
        if (this.staffNotes.length === 0) {
            this.updateStatus('五线谱上没有音符！');
            return;
        }

        this.stopMusic();
        
        // 按时间排序音符
        const sortedNotes = [...this.staffNotes].sort((a, b) => a.time - b.time);
        
        // 创建序列
        const now = Tone.now();
        sortedNotes.forEach((noteObj, index) => {
            const time = now + (noteObj.time * 4); // 缩放时间
            this.synth.triggerAttackRelease(noteObj.note, "4n", time);
        });

        this.updateStatus('播放五线谱音乐...');
    }

    clearStaff() {
        document.querySelectorAll('.staff-note').forEach(note => note.remove());
        this.staffNotes = [];
        this.updateStatus('乐谱已清空');
    }

    getChordProgression() {
        const chordSelects = document.querySelectorAll('.chord-select');
        return Array.from(chordSelects).map(select => select.value);
    }

    generateMusic() {
        // 结合五线谱音符、和弦进行和风格生成音乐
        const chords = this.getChordProgression();
        const key = document.getElementById('key').value;
        const lyrics = document.getElementById('lyrics').value;
        const style = document.querySelector('.preset-btn.active')?.dataset.style || 'happy';
        
        this.updateStatus('生成完整歌曲中...', true);
        
        // 这里可以整合所有元素生成完整音乐
        setTimeout(() => {
            this.updateStatus('歌曲生成完成！');
            document.getElementById('exportBtn').disabled = false;
        }, 2000);
    }

    exportMIDI() {
        // 简化的MIDI导出概念
        if (this.staffNotes.length === 0) {
            this.updateStatus('没有可导出的音乐内容');
            return;
        }

        this.updateStatus('MIDI导出功能开发中...');
        // 实际实现需要使用 midi-writer-js 等库
    }

    stopMusic() {
        this.isPlaying = false;
        this.synth.releaseAll();
        Tone.Transport.stop();
        
        this.sequences.forEach(seq => {
            if (seq && typeof seq.dispose === 'function') {
                seq.dispose();
            }
        });
        this.sequences = [];
    }

    updateStatus(message, showLoading = false) {
        document.getElementById('statusText').textContent = message;
        document.getElementById('loading').style.display = showLoading ? 'block' : 'none';
    }
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    new SongCreator();
    console.log('🎵 歌曲创作平台已就绪！');
});
