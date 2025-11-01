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
        this.currentTempo = 120;
        
        this.initializeEventListeners();
        this.setupAdditionalControls();
    }

    setupAdditionalControls() {
        const durationContainer = document.querySelector('.control-group:nth-child(2)');
        
        // 添加速度控制
        const tempoHtml = `
            <div class="control-group">
                <label>速度 (BPM): 
                    <span id="tempoValue">120</span>
                </label>
                <input type="range" id="tempo" min="60" max="180" value="120" step="5">
                <div class="tempo-presets">
                    <button class="tempo-preset-btn" data-tempo="60">缓慢</button>
                    <button class="tempo-preset-btn" data-tempo="90">舒缓</button>
                    <button class="tempo-preset-btn" data-tempo="120" data-selected="true">中速</button>
                    <button class="tempo-preset-btn" data-tempo="150">快速</button>
                    <button class="tempo-preset-btn" data-tempo="180">极快</button>
                </div>
            </div>
        `;
        
        // 添加乐器选择
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
        
        // 添加旋律预设
        const melodyHtml = `
            <div class="control-group">
                <label>旋律预设:</label>
                <div class="melody-presets">
                    <button class="melody-preset-btn" data-melody="classic">🎼 经典旋律</button>
                    <button class="melody-preset-btn" data-melody="ambient">🌌 氛围音乐</button>
                    <button class="melody-preset-btn" data-melody="upbeat">🎉 轻快节奏</button>
                    <button class="melody-preset-btn" data-melody="cinematic">🎬 电影配乐</button>
                </div>
            </div>
        `;

        durationContainer.insertAdjacentHTML('afterend', tempoHtml + instrumentHtml + melodyHtml);
        
        // 速度滑块事件
        document.getElementById('tempo').addEventListener('input', (e) => {
            this.currentTempo = parseInt(e.target.value);
            document.getElementById('tempoValue').textContent = this.currentTempo;
            if (this.isPlaying) {
                Tone.Transport.bpm.value = this.currentTempo;
            }
        });
        
        // 速度预设按钮
        document.querySelectorAll('.tempo-preset-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tempo = parseInt(e.target.dataset.tempo);
                this.currentTempo = tempo;
                document.getElementById('tempo').value = tempo;
                document.getElementById('tempoValue').textContent = tempo;
                
                document.querySelectorAll('.tempo-preset-btn').forEach(b => {
                    b.classList.remove('active');
                });
                e.target.classList.add('active');
                
                if (this.isPlaying) {
                    Tone.Transport.bpm.value = tempo;
                }
            });
        });
        
        // 乐器选择事件
        document.getElementById('instrument').addEventListener('change', (e) => {
            this.currentInstrument = e.target.value;
            this.updateSynthSound();
        });
        
        // 旋律预设事件
        document.querySelectorAll('.melody-preset-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.melody-preset-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
            });
        });
        
        // 设置默认选中
        document.querySelector('.tempo-preset-btn[data-selected="true"]').classList.add('active');
        document.querySelector('.melody-preset-btn').classList.add('active');
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
            await this.delay(100);
        }
        
        this.updateStatus('正在生成音乐...', true);
        
        try {
            const style = document.querySelector('.preset-btn.active')?.dataset.style || 'happy';
            const duration = parseInt(document.getElementById('duration').value);
            const customPrompt = document.getElementById('customPrompt').value;
            const melodyPreset = document.querySelector('.melody-preset-btn.active')?.dataset.melody || 'classic';
            
            await Tone.start();
            
            this.cleanup();
            
            // 解析自定义描述
            const musicParams = this.parseCustomPrompt(customPrompt, style);
            musicParams.melodyPreset = melodyPreset;
            musicParams.tempo = this.currentTempo;
            
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
        const promptLower = prompt.toLowerCase();
        
        let tempo = this.currentTempo;
        let complexity = 'medium';
        let mood = baseStyle;
        
        // 解析速度关键词
        if (promptLower.includes('缓慢') || promptLower.includes('慢') || promptLower.includes('舒缓')) {
            tempo = Math.min(80, tempo);
        } else if (promptLower.includes('快速') || promptLower.includes('快') || promptLower.includes('活力')) {
            tempo = Math.max(140, tempo);
        }
        
        // 解析复杂度
        if (promptLower.includes('简单') || promptLower.includes('简约') || promptLower.includes('基础')) {
            complexity = 'simple';
        } else if (promptLower.includes('复杂') || promptLower.includes('丰富') || promptLower.includes('多层次')) {
            complexity = 'complex';
        }
        
        // 解析情绪
        if (promptLower.includes('悲伤') || promptLower.includes('忧郁') || promptLower.includes('优雅')) {
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
        const { tempo, complexity, mood, melodyPreset } = params;
        
        // 基础和弦进行
        const chordProgressions = {
            happy: [["C4", "E4", "G4"], ["G3", "B3", "D4"], ["A3", "C4", "E4"], ["F3", "A3", "C4"]],
            calm: [["A3", "C4", "E4"], ["D3", "F3", "A3"], ["E3", "G3", "B3"], ["A3", "C4", "E4"]],
            mystery: [["D4", "F4", "G#4"], ["G#3", "C4", "D#4"], ["C4", "D#4", "G4"], ["D4", "F4", "G#4"]],
            energy: [["G3", "B3", "D4"], ["C4", "E4", "G4"], ["D4", "F#4", "A4"], ["G3", "B3", "D4"]]
        };

        // 旋律预设库
        const melodyLibrary = {
            classic: {
                happy: ["C4", "E4", "G4", "C5", "E5", "G4", "E4", "C4", "G4", "F4", "E4", "D4", "C4"],
                calm: ["A3", "C4", "E4", "G4", "A4", "G4", "E4", "C4", "A3", "G3", "A3", "C4", "E4"],
                mystery: ["D4", "F4", "G#4", "C5", "G#4", "F4", "D4", "C4", "D4", "F4", "G#4", "C5"],
                energy: ["G3", "B3", "D4", "G4", "B4", "D4", "B3", "G3", "D4", "C4", "B3", "A3", "G3"]
            },
            ambient: {
                happy: ["C4", "G4", "E4", "G4", "C5", "G4", "E4", "C4"],
                calm: ["A3", "E4", "C4", "E4", "A4", "E4", "C4", "A3"],
                mystery: ["D4", "G#4", "F4", "G#4", "C5", "G#4", "F4", "D4"],
                energy: ["G3", "D4", "B3", "D4", "G4", "D4", "B3", "G3"]
            },
            upbeat: {
                happy: ["C4", "E4", "G4", "E4", "C5", "G4", "E4", "G4", "C4", "D4", "E4", "F4", "G4"],
                calm: ["A3", "C4", "E4", "C4", "A4", "E4", "C4", "E4", "A3", "B3", "C4", "D4", "E4"],
                mystery: ["D4", "F4", "G#4", "F4", "C5", "G#4", "F4", "G#4", "D4", "E4", "F4", "G4", "G#4"],
                energy: ["G3", "B3", "D4", "B3", "G4", "D4", "B3", "D4", "G3", "A3", "B3", "C4", "D4"]
            },
            cinematic: {
                happy: ["C4", "G3", "E4", "C5", "G4", "E4", "C4", "G4", "F4", "E4", "D4", "C4"],
                calm: ["A3", "E3", "C4", "A4", "E4", "C4", "A3", "E4", "D4", "C4", "B3", "A3"],
                mystery: ["D4", "G#3", "F4", "C5", "G#4", "F4", "D4", "G#4", "G4", "F4", "E4", "D4"],
                energy: ["G3", "D3", "B3", "G4", "D4", "B3", "G3", "D4", "C4", "B3", "A3", "G3"]
            }
        };

        const chords = chordProgressions[mood] || chordProgressions.happy;
        const melody = melodyLibrary[melodyPreset]?.[mood] || melodyLibrary.classic[mood] || melodyLibrary.classic.happy;

        return {
            chords,
            melody,
            tempo,
            complexity,
            rhythm: complexity === 'simple' ? "4n" : "8n"
        };
    }

    cleanup() {
        Tone.Transport.stop();
        Tone.Transport.cancel();
        Tone.Transport.position = 0;
        
        this.sequences.forEach(seq => {
            if (seq && typeof seq.dispose === 'function') {
                seq.dispose();
            }
        });
        this.sequences = [];
        
        this.synth.releaseAll();
    }

    playSequence(sequence, duration) {
        this.cleanup();
        this.isPlaying = true;

        Tone.Transport.bpm.value = sequence.tempo;

        // 创建和弦序列
        const chordSeq = new Tone.Sequence((time, chord) => {
            this.synth.triggerAttackRelease(chord, "2n", time);
        }, sequence.chords, "2n");

        // 创建旋律序列
        const melodySeq = new Tone.Sequence((time, note) => {
            this.synth.triggerAttackRelease(note, sequence.rhythm, time);
        }, sequence.melody, sequence.rhythm);

        this.sequences = [chordSeq, melodySeq];

        chordSeq.start(0);
        melodySeq.start(0);
        
        setTimeout(() => {
            Tone.Transport.start("+0.1");
        }, 100);

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

    // ... 其他方法保持不变（toggleRecording, startRecording, stopRecording, finishRecording, exportAudio, delay, updateStatus）
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

document.addEventListener('DOMContentLoaded', () => {
    new SimpleMusicGenerator();
    console.log('音乐生成器已就绪！');
});
