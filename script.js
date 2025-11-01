class SimpleMusicGenerator {
    constructor() {
        this.synth = new Tone.PolySynth().toDestination();
        this.isRecording = false;
        this.mediaRecorder = null;
        this.recordedChunks = [];
        this.currentAudioUrl = null;
        this.isPlaying = false;
        
        this.initializeEventListeners();
    }

    initializeEventListeners() {
        // 预设按钮
        document.querySelectorAll('.preset-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
            });
        });

        // 设置默认激活第一个按钮
        document.querySelector('.preset-btn').classList.add('active');

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
            this.exportAudio();
        });
    }

    async generateMusic() {
        if (this.isPlaying) {
            this.stopMusic();
        }
        
        this.updateStatus('正在生成音乐...', true);
        
        try {
            const style = document.querySelector('.preset-btn.active')?.dataset.style || 'happy';
            const duration = parseInt(document.getElementById('duration').value);
            const customPrompt = document.getElementById('customPrompt').value;
            
            await Tone.start();
            
            // 彻底停止之前的播放
            this.cleanupTransport();
            
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
                rhythm: "4n"
            },
            calm: {
                melody: ["A3", "C4", "E4", "G4", "E4", "C4", "A3"],
                chords: ["A3", "C4", "E4"],
                rhythm: "2n"
            },
            mystery: {
                melody: ["D4", "F4", "G#4", "C5", "G#4", "F4", "D4"],
                chords: ["D4", "F4", "G#4"],
                rhythm: "4n"
            },
            energy: {
                melody: ["G3", "B3", "D4", "G4", "B4", "D4", "B3", "G3"],
                chords: ["G3", "B3", "D4"],
                rhythm: "8n"
            }
        };

        return sequences[style] || sequences.happy;
    }

    cleanupTransport() {
        // 彻底清理 Transport
        Tone.Transport.stop();
        Tone.Transport.cancel();
        Tone.Transport.position = 0;
        
        // 清理之前的序列
        if (this.melodySeq) {
            this.melodySeq.dispose();
        }
        if (this.chordSeq) {
            this.chordSeq.dispose();
        }
    }

    playSequence(sequence, duration) {
        this.cleanupTransport();
        
        this.isPlaying = true;

        // 创建旋律序列 - 使用更安全的时间调度
        this.melodySeq = new Tone.Sequence((time, note) => {
            try {
                this.synth.triggerAttackRelease(note, sequence.rhythm, time);
            } catch (error) {
                console.warn('Note playback error:', error);
            }
        }, sequence.melody, sequence.rhythm);

        // 创建和弦序列 - 更慢的节奏
        this.chordSeq = new Tone.Sequence((time, chord) => {
            try {
                this.synth.triggerAttackRelease(chord, "1n", time);
            } catch (error) {
                console.warn('Chord playback error:', error);
            }
        }, sequence.chords, "2n");

        // 设置节奏
        Tone.Transport.bpm.value = 120;
        
        // 启动序列
        this.melodySeq.start(0);
        this.chordSeq.start(0);
        
        // 安全启动 Transport
        setTimeout(() => {
            Tone.Transport.start();
        }, 50);

        // 自动停止
        this.stopTimeout = setTimeout(() => {
            this.stopMusic();
            this.updateStatus('播放完成');
        }, duration * 1000);
    }

    stopMusic() {
        this.isPlaying = false;
        
        // 清理 Transport
        Tone.Transport.stop();
        Tone.Transport.cancel();
        Tone.Transport.position = 0;
        
        // 停止序列
        if (this.melodySeq) {
            this.melodySeq.stop();
        }
        if (this.chordSeq) {
            this.chordSeq.stop();
        }
        
        // 清理超时
        if (this.stopTimeout) {
            clearTimeout(this.stopTimeout);
        }
        
        // 停止录音
        if (this.isRecording) {
            this.stopRecording();
        }
        
        this.updateStatus('已停止');
    }

    async toggleRecording() {
        if (!this.isRecording) {
            await this.startRecording();
        } else {
            this.stopRecording();
        }
    }

    async startRecording() {
        if (!this.isPlaying) {
            this.updateStatus('请先生成音乐再开始录音');
            return;
        }

        try {
            // 注意：这里录制的是系统音频输出，需要浏览器支持
            // 在实际部署中可能需要 HTTPS 和用户手势触发
            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false
                } 
            });
            
            this.recordedChunks = [];
            this.mediaRecorder = new MediaRecorder(stream);
            
            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.recordedChunks.push(event.data);
                }
            };
            
            this.mediaRecorder.onstop = () => {
                this.finishRecording();
                // 关闭音轨
                stream.getTracks().forEach(track => track.stop());
            };
            
            this.mediaRecorder.start();
            this.isRecording = true;
            document.getElementById('recordBtn').classList.add('recording');
            document.getElementById('recordBtn').textContent = '⏹️ 停止录音';
            this.updateStatus('录音中...');
            
        } catch (error) {
            this.updateStatus('录音失败: ' + error.message);
            console.error('Recording error:', error);
        }
    }

    stopRecording() {
        if (this.mediaRecorder && this.isRecording) {
            this.mediaRecorder.stop();
            this.isRecording = false;
            document.getElementById('recordBtn').classList.remove('recording');
            document.getElementById('recordBtn').textContent = '● 开始录音';
        }
    }

    finishRecording() {
        const blob = new Blob(this.recordedChunks, { type: 'audio/webm' });
        this.currentAudioUrl = URL.createObjectURL(blob);
        
        // 显示播放器
        const audioPlayer = document.getElementById('audioPlayer');
        audioPlayer.src = this.currentAudioUrl;
        document.getElementById('player').style.display = 'block';
        
        this.updateStatus('录音完成，可以导出音频');
        document.getElementById('exportBtn').disabled = false;
    }

    exportAudio() {
        if (!this.currentAudioUrl) {
            this.updateStatus('没有可导出的音频');
            return;
        }

        try {
            const a = document.createElement('a');
            a.href = this.currentAudioUrl;
            a.download = `music-${new Date().getTime()}.webm`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            
            this.updateStatus('音频文件已开始下载');
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
