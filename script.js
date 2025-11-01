class SimpleMusicGenerator {
    constructor() {
        this.synth = new Tone.PolySynth(Tone.Synth, {
            oscillator: { type: 'sine' },
            envelope: { attack: 0.02, decay: 0.1, sustain: 0.3, release: 1 }
        }).toDestination();
        
        this.isRecording = false;
        this.mediaRecorder = null;
        this.recordedChunks = [];
        this.currentAudioUrl = null;
        this.isPlaying = false;
        this.sequences = [];
        
        this.instruments = {
            piano: { type: 'sine', attack: 0.02, decay: 0.2, sustain: 0.3, release: 1 },
            strings: { type: 'sawtooth', attack: 0.1, decay: 0.3, sustain: 0.4, release: 2 },
            synth: { type: 'square', attack: 0.05, decay: 0.2, sustain: 0.3, release: 0.8 },
            organ: { type: 'triangle', attack: 0.1, decay: 0.4, sustain: 0.5, release: 1.5 }
        };
        
        this.currentInstrument = 'piano';
        
        this.initializeEventListeners();
        this.setupInstrumentSelector();
    }

    setupInstrumentSelector() {
        const instrumentContainer = document.querySelector('.control-group:nth-child(2)');
        const instrumentHtml = `
            <div class="control-group">
                <label>乐器音色:</label>
                <select id="instrument">
                    <option value="piano">🎹 钢琴</option>
                    <option value="strings">🎻 弦乐</option>
                    <option value="synth">🎛️ 合成器</option>
                    <option value="organ">🎵 风琴</option>
                </select>
            </div>
        `;
        instrumentContainer.insertAdjacentHTML('afterend', instrumentHtml);
        
        document.getElementById('instrument').addEventListener('change', (e) => {
            this.currentInstrument = e.target.value;
            this.updateSynthSound();
        });
    }

    updateSynthSound() {
        const settings = this.instruments[this.currentInstrument];
        this.synth.set({
            oscillator: { type: settings.type },
            envelope: settings
        });
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
            await this.delay(100); // 确保完全停止
        }
        
        this.updateStatus('正在生成音乐...', true);
        
        try {
            const style = document.querySelector('.preset-btn.active')?.dataset.style || 'happy';
            const duration = parseInt(document.getElementById('duration').value);
            const customPrompt = document.getElementById('customPrompt').value;
            
            await Tone.start();
            
            // 彻底清理
            this.cleanup();
            
            // 解析自定义描述
            const musicParams = this.parseCustomPrompt(customPrompt, style);
            
            // 生成音乐序列
            const sequence = this.createMusicSequence(musicParams);
            this.playSequence(sequence, duration);
            
            this.updateStatus('音乐生成完成！');
            document.getElementById('exportBtn').disabled = false;
            
        } catch (error) {
            this.updateStatus('生成失败: ' + error.message);
            console.error('Generation error:', error);
        }
    }

    parseCustomPrompt(prompt, baseStyle) {
        // 简单关键词解析
        const promptLower = prompt.toLowerCase();
        
        let tempo = 120;
        let complexity = 'medium';
        let mood = baseStyle;
        
        // 解析速度关键词
        if (promptLower.includes('缓慢') || promptLower.includes('慢') || promptLower.includes('舒缓')) {
            tempo = 80;
        } else if (promptLower.includes('快速') || promptLower.includes('快') || promptLower.includes('活力')) {
            tempo = 140;
        } else if (promptLower.includes('中速')) {
            tempo = 110;
        }
        
        // 解析复杂度
        if (promptLower.includes('简单') || promptLower.includes('简约') || promptLower.includes('基础')) {
            complexity = 'simple';
        } else if (promptLower.includes('复杂') || promptLower.includes('丰富') || promptLower.includes('多层次')) {
            complexity = 'complex';
        }
        
        // 解析情绪
        if (promptLower.includes('悲伤') || promptLower.includes('忧郁')) {
            mood = 'calm';
        } else if (promptLower.includes('快乐') || promptLower.includes('欢快')) {
            mood = 'happy';
        } else if (promptLower.includes('神秘')) {
            mood = 'mystery';
        } else if (promptLower.includes('能量') || promptLower.includes('活力')) {
            mood = 'energy';
        }
        
        return { tempo, complexity, mood, originalPrompt: prompt };
    }

    createMusicSequence(params) {
        const { tempo, complexity, mood } = params;
        
        // 基础和弦进行
        const chordProgressions = {
            happy: [["C4", "E4", "G4"], ["G3", "B3", "D4"], ["A3", "C4", "E4"], ["F3", "A3", "C4"]],
            calm: [["A3", "C4", "E4"], ["D3", "F3", "A3"], ["E3", "G3", "B3"], ["A3", "C4", "E4"]],
            mystery: [["D4", "F4", "G#4"], ["G#3", "C4", "D#4"], ["C4", "D#4", "G4"], ["D4", "F4", "G#4"]],
            energy: [["G3", "B3", "D4"], ["C4", "E4", "G4"], ["D4", "F#4", "A4"], ["G3", "B3", "D4"]]
        };

        // 旋律模式
        const melodyPatterns = {
            happy: ["C4", "E4", "G4", "C5", "E5", "G4", "E4", "C4"],
            calm: ["A3", "C4", "E4", "G4", "E4", "C4", "A3", "G3"],
            mystery: ["D4", "F4", "G#4", "C5", "G#4", "F4", "D4", "C4"],
            energy: ["G3", "B3", "D4", "G4", "B4", "D4", "B3", "G3"]
        };

        const chords = chordProgressions[mood] || chordProgressions.happy;
        const melody = melodyPatterns[mood] || melodyPatterns.happy;

        return {
            chords,
            melody,
            tempo,
            complexity,
            rhythm: complexity === 'simple' ? "4n" : "8n"
        };
    }

    cleanup() {
        // 彻底停止 Transport
        Tone.Transport.stop();
        Tone.Transport.cancel();
        Tone.Transport.position = 0;
        
        // 清理所有序列
        this.sequences.forEach(seq => {
            if (seq && typeof seq.dispose === 'function') {
                seq.dispose();
            }
        });
        this.sequences = [];
        
        // 停止所有音符
        this.synth.releaseAll();
    }

    playSequence(sequence, duration) {
        this.cleanup();
        this.isPlaying = true;

        // 设置速度
        Tone.Transport.bpm.value = sequence.tempo;

        // 创建和弦序列
        const chordSeq = new Tone.Sequence((time, chord) => {
            this.synth.triggerAttackRelease(chord, "2n", time);
        }, sequence.chords, "2n");

        // 创建旋律序列
        const melodySeq = new Tone.Sequence((time, note) => {
            this.synth.triggerAttackRelease(note, sequence.rhythm, time);
        }, sequence.melody, sequence.rhythm);

        // 存储序列引用
        this.sequences = [chordSeq, melodySeq];

        // 启动序列
        chordSeq.start(0);
        melodySeq.start(0);
        
        // 安全启动
        setTimeout(() => {
            Tone.Transport.start("+0.1");
        }, 100);

        // 自动停止
        this.stopTimeout = setTimeout(() => {
            this.stopMusic();
            this.updateStatus('播放完成');
        }, duration * 1000);
    }

    stopMusic() {
        if (!this.isPlaying) return;
        
        this.isPlaying = false;
        this.cleanup();
        
        if (this.stopTimeout) {
            clearTimeout(this.stopTimeout);
        }
        
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
            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: true
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
                stream.getTracks().forEach(track => track.stop());
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
        }
    }

    finishRecording() {
        const blob = new Blob(this.recordedChunks, { type: 'audio/webm' });
        this.currentAudioUrl = URL.createObjectURL(blob);
        
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

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
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
