class SimpleMusicGenerator {
    constructor() {
        this.synth = new Tone.PolySynth().toDestination();
        this.recorder = null;
        this.isRecording = false;
        this.audioContext = null;
        this.mediaRecorder = null;
        this.recordedChunks = [];
        this.currentAudioUrl = null;
        
        this.initializeEventListeners();
        this.setupAudioContext();
    }

    initializeEventListeners() {
        // 预设按钮
        document.querySelectorAll('.preset-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
            });
        });

        // 生成按钮
        document.getElementById('generateBtn').addEventListener('click', () => {
            this.generateMusic();
        });

        // 停止按钮
        document.getElementById('stopBtn').addEventListener('click', () => {
            this.stopMusic();
        });

        // 录音按钮
        document.getElementById('recordBtn').addEventListener('click', () => {
            this.toggleRecording();
        });

        // 导出按钮
        document.getElementById('exportBtn').addEventListener('click', () => {
            this.exportMP3();
        });
    }

    setupAudioContext() {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }

    async generateMusic() {
        this.updateStatus('正在生成音乐...', true);
        
        try {
            const style = document.querySelector('.preset-btn.active')?.dataset.style || 'happy';
            const duration = parseInt(document.getElementById('duration').value);
            const customPrompt = document.getElementById('customPrompt').value;
            
            await Tone.start();
            this.stopMusic();
            
            // 根据风格生成不同的音乐模式
            const sequence = this.createMusicSequence(style, customPrompt);
            this.playSequence(sequence, duration);
            
            this.updateStatus('音乐生成完成！');
            document.getElementById('exportBtn').disabled = false;
            
        } catch (error) {
            this.updateStatus('生成失败: ' + error.message);
            console.error('Generation error:', error);
        }
    }

    createMusicSequence(style, customPrompt) {
        const sequences = {
            happy: {
                melody: ["C4", "E4", "G4", "C5", "E5", "G4", "E4", "C4"],
                chords: ["C4", "E4", "G4"],
                rhythm: [0.2, 0.2, 0.2, 0.4]
            },
            calm: {
                melody: ["A3", "C4", "E4", "G4", "E4", "C4", "A3"],
                chords: ["A3", "C4", "E4"],
                rhythm: [0.4, 0.4, 0.4, 0.8]
            },
            mystery: {
                melody: ["D4", "F4", "G#4", "C5", "G#4", "F4", "D4"],
                chords: ["D4", "F4", "G#4"],
                rhythm: [0.3, 0.3, 0.6, 0.3]
            },
            energy: {
                melody: ["G3", "B3", "D4", "G4", "B4", "D4", "B3", "G3"],
                chords: ["G3", "B3", "D4"],
                rhythm: [0.1, 0.1, 0.1, 0.2]
            }
        };

        return sequences[style] || sequences.happy;
    }

    playSequence(sequence, duration) {
        this.stopMusic();
        
        // 创建旋律序列
        this.melodySeq = new Tone.Sequence((time, note) => {
            this.synth.triggerAttackRelease(note, "8n", time);
        }, sequence.melody).start(0);

        // 创建和弦序列
        this.chordSeq = new Tone.Sequence((time, chord) => {
            this.synth.triggerAttackRelease(chord, "2n", time);
        }, sequence.chords).start(0);

        // 设置节奏
        Tone.Transport.bpm.value = 120;
        Tone.Transport.start();

        // 自动停止
        setTimeout(() => {
            this.stopMusic();
            this.updateStatus('播放完成');
        }, duration * 1000);
    }

    stopMusic() {
        if (this.melodySeq) this.melodySeq.stop();
        if (this.chordSeq) this.chordSeq.stop();
        Tone.Transport.stop();
        
        if (this.isRecording) {
            this.stopRecording();
        }
    }

    async toggleRecording() {
        if (!this.isRecording) {
            await this.startRecording();
        } else {
            this.stopRecording();
        }
    }

    async startRecording() {
        try {
            this.recordedChunks = [];
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.mediaRecorder = new MediaRecorder(stream);
            
            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.recordedChunks.push(event.data);
                }
            };
            
            this.mediaRecorder.onstop = () => {
                this.finishRecording();
            };
            
            this.mediaRecorder.start();
            this.isRecording = true;
            document.getElementById('recordBtn').classList.add('recording');
            document.getElementById('recordBtn').textContent = '⏹️ 停止录音';
            this.updateStatus('录音中...');
            
        } catch (error) {
            this.updateStatus('录音失败: ' + error.message);
        }
    }

    stopRecording() {
        if (this.mediaRecorder && this.isRecording) {
            this.mediaRecorder.stop();
            this.isRecording = false;
            document.getElementById('recordBtn').classList.remove('recording');
            document.getElementById('recordBtn').textContent = '● 开始录音';
            this.updateStatus('录音完成');
        }
    }

    finishRecording() {
        const blob = new Blob(this.recordedChunks, { type: 'audio/webm' });
        this.currentAudioUrl = URL.createObjectURL(blob);
        
        // 显示播放器
        const audioPlayer = document.getElementById('audioPlayer');
        audioPlayer.src = this.currentAudioUrl;
        document.getElementById('player').style.display = 'block';
        
        this.updateStatus('录音完成，可以导出MP3');
        document.getElementById('exportBtn').disabled = false;
    }

    exportMP3() {
        if (!this.currentAudioUrl) {
            this.updateStatus('没有可导出的音频');
            return;
        }

        try {
            // 创建下载链接
            const a = document.createElement('a');
            a.href = this.currentAudioUrl;
            a.download = `music-${new Date().getTime()}.webm`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            
            this.updateStatus('MP3文件已开始下载');
        } catch (error) {
            this.updateStatus('导出失败: ' + error.message);
        }
    }

    updateStatus(message, showLoading = false) {
        document.getElementById('statusText').textContent = message;
        document.getElementById('loading').style.display = showLoading ? 'block' : 'none';
    }
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    new SimpleMusicGenerator();
    console.log('音乐生成器已就绪！');
});
