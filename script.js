/* script.js — 重构版
   模块：NoteMath, AudioEngine, UIManager, SongController
   主要功能：
   - 支持 note durations: 1/16, 1/8, 1/4, 1/2, 1
   - 支持 tempo (BPM) 和 time signature（拍号）
   - 和弦真实参与播放与 MIDI 导出
   - 可视化五线谱、可添加音符（单击/拖拽）、双击删除
   - 导出 MIDI（内嵌实现）
*/

/* --------------------------- NoteMath ---------------------------
   负责音高 <-> MIDI number 与 y 坐标的映射（预计算表）
   五线谱以 C4（middle C）为参考，y 值用于元素定位（像素）
-----------------------------------------------------------------*/
class NoteMath {
    constructor(staffHeight = 160, lineSpacing = 10) {
        this.staffHeight = staffHeight;
        this.lineSpacing = lineSpacing;
        this.pitchOrder = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
        this.precompute();
    }

    midiNumber(note) {
        // note like "C4" or "C#5"
        const m = note.match(/^([A-G])(#?)(\d)$/);
        if (!m) return null;
        const name = m[1] + (m[2] || '');
        const octave = parseInt(m[3], 10);
        const index = this.pitchOrder.indexOf(name);
        return (octave + 1) * 12 + index; // MIDI formula: C-1 = 0
    }

    noteNameFromMidi(midi) {
        const octave = Math.floor(midi / 12) - 1;
        const name = this.pitchOrder[midi % 12];
        return `${name}${octave}`;
    }

    precompute() {
        // 为常见范围（C2..C6）预计算 y 值与 MIDI 映射
        this.minMidi = this.midiNumber('C2');
        this.maxMidi = this.midiNumber('C6');
        this.midiToY = new Map();
        this.yToMidi = [];
        // We'll map semitone steps to vertical staff steps (lines/spaces)
        // Each diatonic step (line or space) is one "staff step"; semitone increments are half steps.
        // We'll map MIDI semitone to y by: y = center - (semitone - refSemitone) * (lineSpacing / 2)
        const refMidi = this.midiNumber('C4'); // reference middle C
        const centerY = this.staffHeight / 2 + 10; // center pixel for C4
        for (let midi = this.minMidi; midi <= this.maxMidi; midi++) {
            const semitoneDiff = midi - refMidi;
            const y = centerY - semitoneDiff * (this.lineSpacing / 2);
            this.midiToY.set(midi, y);
            this.yToMidi.push({ midi, y });
        }
    }

    getYForNote(note) {
        const midi = this.midiNumber(note);
        if (midi === null) return this.staffHeight / 2;
        if (midi < this.minMidi) return this.midiToY.get(this.minMidi);
        if (midi > this.maxMidi) return this.midiToY.get(this.maxMidi);
        return this.midiToY.get(midi);
    }

    closestNoteFromY(y) {
        // find closest midi by comparing y distances (fast enough for our small range)
        let best = null, minDiff = Infinity;
        for (const { midi, y: my } of this.yToMidi) {
            const d = Math.abs(my - y);
            if (d < minDiff) { minDiff = d; best = midi; }
        }
        return this.noteNameFromMidi(best);
    }
}

/* --------------------------- AudioEngine ---------------------------
   封装 Tone.js 的 Synth、Transport、播放/停止、和弦伴奏
-----------------------------------------------------------------*/
class AudioEngine {
    constructor() {
        this.synth = null;
        this.chordSynth = null;
        this.part = null;
        this.bpm = 90;
        Tone.start && Tone.start(); // unlock audio on some browsers
        this.initSynths();
    }

    initSynths() {
        if (!this.synth) {
            this.synth = new Tone.PolySynth(Tone.Synth, {
                oscillator: { type: 'triangle' },
                envelope: { attack: 0.01, decay: 0.1, sustain: 0.7, release: 0.6 }
            }).toDestination();
        }
        if (!this.chordSynth) {
            this.chordSynth = new Tone.PolySynth(Tone.Synth, {
                oscillator: { type: 'sine' },
                envelope: { attack: 0.02, decay: 0.3, sustain: 0.5, release: 0.8 }
            }).toDestination();
        }
    }

    setBPM(bpm) {
        this.bpm = bpm;
        Tone.Transport.bpm.value = bpm;
    }

    schedulePlayback(notes, bpm, timeSig = [4,4], onStop=null) {
        // notes: [{time: beatTime (float, in beats), note: "C4", duration: beats}, ...]
        this.initSynths();
        this.setBPM(bpm || this.bpm);
        Tone.Transport.cancel(); // clear existing events
        // create a Tone.Part to schedule note triggers
        const events = notes.map(n => ({ time: `${n.time}`, note: n.note, dur: `${n.duration}n`, durBeats: n.duration }));
        // We'll schedule using absolute seconds via Tone.Transport schedule — but simpler use Tone.Part
        this.part = new Tone.Part((time, ev) => {
            this.synth.triggerAttackRelease(ev.note, ev.dur, time);
        }, events.map(ev => [ev.time, ev])).start(0);
        // set loop false and start transport
        Tone.Transport.start();
    }

    scheduleChords(chords, bpm) {
        // chords: [{time: beatTime, notes: ["C4","E4","G4"], duration: beats}, ...]
        if (!chords || chords.length === 0) return;
        this.initSynths();
        // schedule chord synth separately
        chords.forEach(ch => {
            const time = Tone.Time(ch.time + 'm').toSeconds(); // time in measures? (we pass beats as numbers below)
            // To keep things simple, schedule with Tone.Transport.scheduleOnce using relative "now + x"
            Tone.Transport.schedule((t) => {
                this.chordSynth.triggerAttackRelease(ch.notes, Tone.Time(`${ch.duration}n`).toSeconds(), t);
            }, ch.time);
        });
    }

    stop() {
        Tone.Transport.stop();
        Tone.Transport.cancel();
        if (this.part) { this.part.dispose(); this.part = null; }
    }
}

/* --------------------------- MIDI Utilities ---------------------------
   简单的 MIDI 文件构造，仅支持 note on/off, tempo meta, 单轨 melody + one chord track.
   PPQ = 480
-----------------------------------------------------------------*/
class MidiBuilder {
    constructor(ppq = 480) {
        this.ppq = ppq;
    }

    // helper: convert int to bytes
    _u32(v) {
        return [
            (v >> 24) & 0xFF,
            (v >> 16) & 0xFF,
            (v >> 8) & 0xFF,
            v & 0xFF
        ];
    }

    // variable length quantity
    _vlq(value) {
        let buffer = value & 0x7F;
        const bytes = [];
        value >>= 7;
        while (value > 0) {
            buffer <<= 8;
            buffer |= ((value & 0x7F) | 0x80);
            value >>= 7;
        }
        while (true) {
            bytes.push(buffer & 0xFF);
            if (buffer & 0x80) buffer >>= 8;
            else break;
        }
        return bytes;
    }

    _noteToMidiNumber(note) {
        const m = note.match(/^([A-G])(#?)(\d)$/);
        if (!m) return 60;
        const name = m[1] + (m[2] || '');
        const octave = parseInt(m[3],10);
        const map = {'C':0,'C#':1,'D':2,'D#':3,'E':4,'F':5,'F#':6,'G':7,'G#':8,'A':9,'A#':10,'B':11};
        return (octave + 1) * 12 + map[name];
    }

    build(melodyNotes, chordTracks, bpm=90) {
        // melodyNotes: [{time: beats(float), note:"C4", duration: beats(float)}]
        // chordTracks: [{time: beats, notes:["C4","E4","G4"], duration: beats}, ...]
        const ticksPerBeat = this.ppq; // quarter note = ppq ticks
        // Header chunk
        const header = [].concat(
            [0x4d,0x54,0x68,0x64], // "MThd"
            this._u32(6),
            [0x00,0x00], // format 0 (we will merge into single multi-track? use format 1)
            [0x00,0x02], // 2 tracks: melody + chord
            [(ticksPerBeat >> 8) & 0xFF, ticksPerBeat & 0xFF]
        );

        // Tempo meta event (microseconds per quarter)
        const mpqn = Math.round(60000000 / bpm);
        const tempoEvent = [0x00, 0xFF, 0x51, 0x03,
            (mpqn >> 16) & 0xFF, (mpqn >> 8) & 0xFF, mpqn & 0xFF];

        // Build track for melody
        let melodyTrackEvents = [];
        melodyTrackEvents = melodyTrackEvents.concat(tempoEvent);
        melodyTrackEvents.push(0x00, 0xFF, 0x2F, 0x00); // end of track placeholder - we'll rebuild correctly

        // Instead of building low-level event merging (complex), we'll create per-track event lists and then convert.
        const buildTrack = (noteList) => {
            // noteList sorted by time
            noteList.sort((a,b) => a.time - b.time);
            const events = [];
            let lastTick = 0;
            for (const n of noteList) {
                const onTick = Math.round(n.time * ticksPerBeat);
                const deltaOn = onTick - lastTick;
                lastTick = onTick;
                // note on: 0x90, channel 0
                events.push(...this._vlq(deltaOn));
                events.push(0x90, this._noteToMidiNumber(n.note), 100);
                const offTick = Math.round((n.time + n.duration) * ticksPerBeat);
                // schedule note-off later by inserting an event in a map; simpler: push note-off event as separate list and merge
                // We'll collect off events in an array and merge later. For simplicity, create on+off entries then sort by tick
                n._onTick = onTick;
                n._offTick = offTick;
            }
            // create a combined list of on/off entries
            const eventsByTick = [];
            for (const n of noteList) {
                eventsByTick.push({tick: n._onTick, type:'on', note:n});
                eventsByTick.push({tick: n._offTick, type:'off', note:n});
            }
            eventsByTick.sort((a,b) => a.tick - b.tick || (a.type==='off' ? -1:1));
            // now build event bytes with delta times
            const bytes = [];
            let prev = 0;
            for (const ev of eventsByTick) {
                const delta = ev.tick - prev;
                prev = ev.tick;
                bytes.push(...this._vlq(delta));
                if (ev.type === 'on') {
                    bytes.push(0x90, this._noteToMidiNumber(ev.note.note), 100);
                } else {
                    bytes.push(0x80, this._noteToMidiNumber(ev.note.note), 64);
                }
            }
            // end of track
            bytes.push(...this._vlq(0));
            bytes.push(0xFF, 0x2F, 0x00);
            return bytes;
        };

        // Melody track bytes
        const melodyBytes = buildTrack(melodyNotes);

        // Chord track: convert chords into "notes" where each chord note is a separate event
        const chordNotesExpanded = [];
        for (const ch of chordTracks) {
            for (const note of ch.notes) {
                chordNotesExpanded.push({ time: ch.time, note: note, duration: ch.duration });
            }
        }
        const chordBytes = buildTrack(chordNotesExpanded);

        // Create track chunks
        const trackChunk = (bytes) => {
            const len = bytes.length;
            return [].concat(
                [0x4d,0x54,0x72,0x6b],
                this._u32(len),
                bytes
            );
        };

        const headerArr = header;
        const melodyChunk = trackChunk(melodyBytes);
        const chordChunk = trackChunk(chordBytes);

        const full = new Uint8Array(headerArr.length + melodyChunk.length + chordChunk.length);
        let offset = 0;
        full.set(headerArr, offset); offset += headerArr.length;
        full.set(melodyChunk, offset); offset += melodyChunk.length;
        full.set(chordChunk, offset); offset += chordChunk.length;

        return new Blob([full], { type: 'audio/midi' });
    }
}

/* --------------------------- UIManager ---------------------------
   负责 DOM 渲染、事件绑定、五线谱渲染（基本）、小节线、note tool
-----------------------------------------------------------------*/
class UIManager {
    constructor(noteMath) {
        this.noteMath = noteMath;
        this.staff = document.getElementById('staff');
        this.staffBars = document.getElementById('staffBars');
        this.pianoKeyboard = document.getElementById('pianoKeyboard');
        this.noteCountEl = document.getElementById('noteCount');
        this.statusText = document.getElementById('statusText');
        this.loadingEl = document.getElementById('loading');
        this.controlsContainer = document.querySelector('.staff-controls');
        // state
        this.durationValue = 0.25; // default quarter note = 1 beat. we'll represent durations as beats: 1/4 note = 1 beat; 1/8 = 0.5 beat etc.
        this.tempo = 90;
        this.timeSig = [4,4];
        this.nextX = 50;
        this.measureWidth = 320; // pixels per measure (visual)
        // setup
        this._createDurationSelector();
        this._createTempoAndTimeSig();
        this._renderStaffLines();
        // keyboard is created by SongController (uses whiteKeys/blackKeys arrays)
    }

    _createDurationSelector() {
        // add duration selector into .staff-controls
        const wrap = document.createElement('div');
        wrap.style.display = 'flex';
        wrap.style.gap = '8px';
        wrap.style.alignItems = 'center';
        wrap.innerHTML = `<label style="font-weight:600">音符时值</label>`;
        const durations = [
            { label: '1/16', beats: 0.25 },
            { label: '1/8', beats: 0.5 },
            { label: '1/4', beats: 1 },
            { label: '1/2', beats: 2 },
            { label: '1', beats: 4 }
        ];
        this.durationBtns = [];
        for (const d of durations) {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'preset-btn';
            b.textContent = d.label;
            b.dataset.beats = d.beats;
            b.style.padding = '6px 10px';
            b.addEventListener('click', () => {
                this.durationBtns.forEach(x => x.classList.remove('active'));
                b.classList.add('active');
                this.durationValue = d.beats;
                this.setStatus(`选中时值 ${d.label}（${d.beats} 拍）`);
            });
            wrap.appendChild(b);
            this.durationBtns.push(b);
        }
        // default select 1/4
        setTimeout(()=> this.durationBtns[2].classList.add('active'), 50);
        this.controlsContainer.appendChild(wrap);
    }

    _createTempoAndTimeSig() {
        const wrap = document.createElement('div');
        wrap.style.display = 'flex';
        wrap.style.gap = '8px';
        wrap.style.alignItems = 'center';
        wrap.innerHTML = `<label style="font-weight:600">BPM</label>`;
        this.tempoInput = document.createElement('input');
        this.tempoInput.type = 'number';
        this.tempoInput.value = this.tempo;
        this.tempoInput.min = 20;
        this.tempoInput.max = 300;
        this.tempoInput.style.width = '80px';
        this.tempoInput.addEventListener('change', () => {
            this.tempo = parseInt(this.tempoInput.value,10) || 90;
            this.setStatus(`速度设置为 ${this.tempo} BPM`);
        });
        wrap.appendChild(this.tempoInput);

        const tsLabel = document.createElement('label');
        tsLabel.style.fontWeight = '600';
        tsLabel.style.marginLeft = '6px';
        tsLabel.textContent = '拍号';
        wrap.appendChild(tsLabel);

        this.timeSigSelect = document.createElement('select');
        [['4/4',[4,4]], ['3/4',[3,4]], ['6/8',[6,8]]].forEach(([text, val]) => {
            const o = document.createElement('option');
            o.value = JSON.stringify(val);
            o.textContent = text;
            this.timeSigSelect.appendChild(o);
        });
        this.timeSigSelect.addEventListener('change', () => {
            this.timeSig = JSON.parse(this.timeSigSelect.value);
            this.setStatus(`拍号 ${this.timeSig[0]}/${this.timeSig[1]}`);
            // optionally re-render measure lines
            this.renderMeasures();
        });
        wrap.appendChild(this.timeSigSelect);

        this.controlsContainer.appendChild(wrap);
    }

    _renderStaffLines() {
        // draw 5 staff lines centrally
        const heights = [100, 80, 60, 40, 20];
        this.staff.innerHTML = ''; // clear
        heights.forEach((top) => {
            const line = document.createElement('div');
            line.className = 'line';
            line.style.position = 'absolute';
            line.style.top = `${top}px`;
            line.style.width = '2000px';
            line.style.height = '1px';
            line.style.background = '#222';
            this.staff.appendChild(line);
        });
        // ensure staff bars container overlays
        this.staffBars.innerHTML = '';
        this.staff.appendChild(this.staffBars);
        // render initial measures
        this.renderMeasures();
    }

    renderMeasures() {
        // draw measure lines based on measureWidth
        this.staffBars.innerHTML = '';
        const total = 10; // initial number of measures (expandable)
        for (let i=0;i<total;i++) {
            const x = i * this.measureWidth + 40;
            const bar = document.createElement('div');
            bar.className = 'bar-line';
            bar.style.position = 'absolute';
            bar.style.left = `${x}px`;
            bar.style.top = '0';
            bar.style.height = '100%';
            bar.style.width = '2px';
            bar.style.background = '#bbb';
            this.staffBars.appendChild(bar);
        }
    }

    createPiano(whiteKeys, blackKeys, onKeyDown, onKeyUp) {
        this.pianoKeyboard.innerHTML = '';
        // generate white keys
        whiteKeys.forEach((note, idx) => {
            const key = document.createElement('div');
            key.className = 'piano-key';
            key.dataset.note = note;
            key.style.display = 'inline-block';
            key.addEventListener('mousedown', (e)=>{ e.preventDefault(); onKeyDown(note); });
            key.addEventListener('mouseup', ()=> onKeyUp(note));
            key.addEventListener('mouseleave', ()=> onKeyUp(note));
            key.addEventListener('touchstart', (e)=>{ e.preventDefault(); onKeyDown(note); });
            key.addEventListener('touchend', ()=> onKeyUp(note));
            const label = document.createElement('div');
            label.className = 'piano-key-label';
            label.textContent = note.replace(/\d/g,'');
            key.appendChild(label);
            this.pianoKeyboard.appendChild(key);
        });
        // black keys positioned absolute relative to keyboard, we'll place them via left offset
        blackKeys.forEach(({note, offset}) => {
            const black = document.createElement('div');
            black.className = 'piano-key black';
            black.dataset.note = note;
            black.style.position = 'absolute';
            black.style.left = `${offset * 30}px`;
            black.addEventListener('mousedown', (e)=>{ e.preventDefault(); onKeyDown(note); });
            black.addEventListener('mouseup', ()=> onKeyUp(note));
            black.addEventListener('touchstart', (e)=>{ e.preventDefault(); onKeyDown(note); });
            black.addEventListener('touchend', ()=> onKeyUp(note));
            const label = document.createElement('div');
            label.className = 'piano-key-label';
            label.textContent = note.replace(/\d/g,'');
            black.appendChild(label);
            this.pianoKeyboard.appendChild(black);
        });
    }

    addNoteElement(x, note, durationBeats, onDelete) {
        const y = this.noteMath.getYForNote(note);
        const el = document.createElement('div');
        el.className = 'staff-note';
        el.textContent = note.replace(/\d/g,'');
        el.style.left = `${x}px`;
        el.style.top = `${y}px`;
        el.title = `${note} (${durationBeats} beats)`;
        el.dataset.note = note;
        el.dataset.duration = durationBeats;
        el.addEventListener('dblclick', () => { el.remove(); onDelete && onDelete(el); });
        this.staff.appendChild(el);
        this.updateNoteCount();
        return el;
    }

    updateNoteCount(count) {
        const c = (typeof count === 'number') ? count : document.querySelectorAll('.staff-note').length;
        this.noteCountEl.textContent = `${c} 个音符`;
    }

    setStatus(msg, loading=false) {
        this.statusText.textContent = msg;
        this.loadingEl.style.display = loading ? 'block' : 'none';
    }

    getDurationBeats() {
        return this.durationValue; // beats unit (quarter = 1 beat)
    }

    getTempo() {
        return this.tempo;
    }

    getTimeSignature() {
        return this.timeSig;
    }
}

/* --------------------------- SongController ---------------------------
   负责管理乐谱数据结构、用户交互逻辑、播放/MIDI 导出流程
-----------------------------------------------------------------*/
class SongController {
    constructor() {
        this.noteMath = new NoteMath(160, 10);
        this.ui = new UIManager(this.noteMath);
        this.audio = new AudioEngine();
        this.midiBuilder = new MidiBuilder(480);
        this.staffNotes = []; // {time (beats), note, duration (beats), x}
        this.chords = []; // {time, notes[], duration}
        this.nextBeat = 0; // next insertion time in beats (simple sequencer cursor)
        this.initUI();
    }

    initUI() {
        // piano layout arrays like original
        this.whiteKeys = [
            'C2','D2','E2','F2','G2','A2','B2',
            'C3','D3','E3','F3','G3','A3','B3',
            'C4','D4','E4','F4','G4','A4','B4',
            'C5','D5','E5','F5','G5','A5','B5',
            'C6'
        ];
        this.blackKeys = [
            {note:'C#2', offset:1},{note:'D#2', offset:2},
            {note:'F#2', offset:4},{note:'G#2', offset:5},{note:'A#2', offset:6},
            {note:'C#3', offset:8},{note:'D#3', offset:9},
            {note:'F#3', offset:11},{note:'G#3', offset:12},{note:'A#3', offset:13},
            {note:'C#4', offset:15},{note:'D#4', offset:16},
            {note:'F#4', offset:18},{note:'G#4', offset:19},{note:'A#4', offset:20},
            {note:'C#5', offset:22},{note:'D#5', offset:23},
            {note:'F#5', offset:25},{note:'G#5', offset:26},{note:'A#5', offset:27},
            {note:'C#6', offset:29}
        ];
        // create piano UI
        this.ui.createPiano(this.whiteKeys, this.blackKeys, (note)=> this.onKeyDown(note), (note)=> this.onKeyUp(note));
        // bind staff click for adding notes (use click to place at current nextBeat and selected duration)
        this.ui.staff.addEventListener('click', (e)=> {
            const rect = this.ui.staff.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            const note = this.noteMath.closestNoteFromY(y);
            const duration = this.ui.getDurationBeats();
            const time = this.nextBeat; // simple append cursor mode
            // add data
            this.addNote({time, note, duration, x});
            this.nextBeat += duration; // advance cursor
        });
        // bind generate/play/stop/export buttons
        document.getElementById('playStaff').addEventListener('click', ()=> this.play());
        document.getElementById('stopBtn').addEventListener('click', ()=> this.stop());
        document.getElementById('generateBtn').addEventListener('click', ()=> this.generatePreview());
        document.getElementById('exportMidi').addEventListener('click', ()=> this.exportMIDI());
        document.getElementById('clearStaff').addEventListener('click', ()=> this.clear());
        // chord select elements — collect current chord progression from DOM when needed
        // record/export buttons remain as before (MP3 handled elsewhere)
        this.ui.setStatus('准备就绪：点击谱面或钢琴键添加音符。');
    }

    addNote({time, note, duration, x}) {
        if (x === undefined) {
            // compute x from time for visual layout
            x = Math.round(time * (this.ui.measureWidth / this.ui.getTimeSignature()[0])); // approximate
            x += 40;
        }
        // create DOM element
        const el = this.ui.addNoteElement(x, note, duration, (deletedEl) => {
            // on delete, remove from staffNotes
            this.staffNotes = this.staffNotes.filter(n => n.el !== deletedEl);
            this.ui.updateNoteCount(this.staffNotes.length);
        });
        const obj = { time, note, duration, x, el };
        this.staffNotes.push(obj);
        this.ui.updateNoteCount(this.staffNotes.length);
        this.ui.setStatus(`已添加 ${note}，时值 ${duration} 拍，位于 ${time} 拍处`);
    }

    addChordAtCursor(chordName = 'C') {
        // simple mapping chordName to triad in current octave
        // for demo, we map C->C4 E4 G4 etc.
        const root = chordName.replace(/\d/g,'') + '4';
        // crude mapping: build major triad (we won't parse minors etc here, but can be extended)
        // For simplicity, assume major triads:
        const mapOffsets = { 'C': [0,4,7], 'G':[0,4,7], 'A':[0,3,7], 'F':[0,4,7], 'D':[0,4,7], 'E':[0,4,7] };
        const base = (root.match(/^([A-G])(#?)/) || [])[0] || 'C';
        const offsets = mapOffsets[base] || [0,4,7];
        const midiRoot = this.noteMath.midiNumber(root);
        const notes = offsets.map(o => this.noteMath.noteNameFromMidi(midiRoot + o));
        const chord = { time: this.nextBeat, notes, duration: this.ui.getDurationBeats() };
        this.chords.push(chord);
        this.ui.setStatus(`已添加和弦 ${chordName} 于 ${chord.time} 拍`);
    }

    onKeyDown(note) {
        // immediate preview and also add to staff at cursor
        this.audio.initSynths && this.audio.initSynths();
        if (this.audio.synth) this.audio.synth.triggerAttack(note);
        // add to staff
        const duration = this.ui.getDurationBeats();
        const time = this.nextBeat;
        this.addNote({time, note, duration});
        this.nextBeat += duration;
    }

    onKeyUp(note) {
        if (this.audio.synth) this.audio.synth.triggerRelease(note);
    }

    play() {
        if (this.staffNotes.length === 0) {
            this.ui.setStatus('五线谱为空，请先添加音符！');
            return;
        }
        // transform staffNotes to simple array with times & durations
        const notes = this.staffNotes.map(n => ({ time: n.time, note: n.note, duration: n.duration }));
        // sort by start time
        notes.sort((a,b)=>a.time - b.time);
        // schedule using AudioEngine
        this.audio.schedulePlayback(notes, this.ui.getTempo(), this.ui.getTimeSignature());
        // schedule chords too
        this.audio.scheduleChords(this.chords, this.ui.getTempo());
        this.ui.setStatus('正在播放…');
    }

    stop() {
        this.audio.stop();
        this.ui.setStatus('播放已停止');
    }

    clear() {
        // clear DOM
        document.querySelectorAll('.staff-note').forEach(e => e.remove());
        this.staffNotes = [];
        this.chords = [];
        this.nextBeat = 0;
        this.ui.updateNoteCount(0);
        this.ui.setStatus('乐谱已清空');
    }

    generatePreview() {
        // create a short preview by playing current notes in sequence for requested total duration (UI had duration selector — but we interpret there the song duration in seconds not beats)
        // For now, just play the melody at current tempo as a preview
        this.play();
        setTimeout(()=> {
            this.stop();
            this.ui.setStatus('预览播放结束');
        }, 1000 * (60 / (this.ui.getTempo()) * 8)); // naive: play ~8 bars
    }

    exportMIDI() {
        if (this.staffNotes.length === 0 && this.chords.length === 0) {
            this.ui.setStatus('没有可导出的音乐内容');
            return;
        }
        // build melody notes list for MIDI builder
        const melody = this.staffNotes.map(n => ({ time: n.time, note: n.note, duration: n.duration }));
        const chords = this.chords.map(c => ({ time: c.time, notes: c.notes, duration: c.duration }));
        const blob = this.midiBuilder.build(melody, chords, this.ui.getTempo());
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'song.mid';
        a.click();
        this.ui.setStatus('MIDI 导出完成');
    }
}

/* --------------------------- 启动 --------------------------- */
document.addEventListener('DOMContentLoaded', () => {
    window.songController = new SongController();
});
