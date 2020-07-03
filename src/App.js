import React, {Component, Fragment} from 'react';
import {state} from "./state/State";
import {Provider} from "mobx-react";
import {produce} from "immer";
import Midi from "./components/Midi";
import MidiPortsSelect from "./components/MidiPortsSelect";
import parseMidi from "parse-midi";
import {NOTE_NAME} from "./utils/midi";
import {
    BEND_DEFAULT, CC11,
    CHAN_PRESS,
    DISPLAY_DATA, DISPLAY_GRAPH,
    loadPreferences, POLY_PRESS,
    savePreferences,
    Y_DEFAULT,
    Z_DEFAULT
} from "./utils/preferences";
import './App.css';

class App extends Component {

    state = {
        display: DISPLAY_DATA,
        bend_range: 48,
        bend_select: "48",
        bend_custom: "",
        y_cc: 74,                // number
        z_cc_type: CHAN_PRESS,   // string
        master_channel: "1",
        ch: Array.from({length: 16}, u => ({
            timestamp: 0,
            note_on: -1,
            note_off: -1,
            notes: {},          // list of notes controlled by this channel
            chan_pressure: 0,
            bend: -1,
            cc_num: -1,
            cc_val : 0
        })),
        voices: [],             // we use an array to guarantee the order
        bend_test: 8192,
        pressure_test: 0
    };

    setDisplayMode = (e) => {
        // console.log(e, e.target, e.target.value);
        this.setState({display: parseInt(e.target.value)});
    };

    clearMessages = (e) => {
        this.setState({
            ch: Array.from({length: 16}, u => ({
                timestamp: 0,
                note_on: -1,
                note_off: -1,
                notes: {},      // list of notes controlled by this channel
                chan_pressure: -1,
                bend: -1,
                cc_num: -1,
                cc_val: 0
            }))});
    };

    setBendRange = (e) => {
        const v = typeof e === "string" ? e : e.target.value;
        const n = v === "custom" ? parseInt(this.state.bend_custom, 10) : parseInt(v, 10);
        this.setState(produce(
            draft => {
                draft.bend_select = v;
                if (!isNaN(n)) {
                    // console.log("setBendRange invalid range", v, this.state.bend_custom);
                // } else {
                    draft.bend_range = n;
                }
            }
        ));
        savePreferences({bend_select: v});
        if (v === "custom") {
            if (!isNaN(n)) {
                savePreferences({bend_custom: n});
            }
        }
    };

    setBendCustom = (e) => {
        const v = e.target.value;
        const n = parseInt(v, 10);
        this.setState(produce(
            draft => {
                draft.bend_custom = v;
                if (isNaN(n)) {
                    // console.log("setBendCustom invalid range", v);
                } else {
                    draft.bend_range = n;
                }
            }
        ));
        savePreferences({bend_custom: v});
    };

    setYCC = (e) => {
        const v = parseInt(e.target.value, 10);
        this.setState({y_cc: v});
        savePreferences({y_cc: v});
    };

    setZCC = (e) => {
        const v = e.target.value;
        this.setState({z_cc_type: v});
        savePreferences({z_cc_type: v});
    };

    setMasterChannel = (e) => {
        this.setState({master_channel: e.target.value});
    };

    getBendInSemitones = (pitchBend) => {

        // min:        0
        // center:  8192
        // max:    16383

        // To map [min, max] to [-1, 1], while ensuring center 8192 is exactly 0,
        // we need to divide by different values depending on whether the pitch
        // bend is up or down, as up has 1 less possible value.

        const divider = pitchBend <= 8192 ? 8192 : (8192 - 1);
        const factor = (pitchBend - 8192) / divider;
        return factor * this.state.bend_range;
    };

    addNoteInChannel = (channel, note) => {
        // add to the list of notes controlled by this channel:
        if (!channel.notes.hasOwnProperty(note)) {
            channel.notes[note] =  {
                timestamp: 0,
                note: note,
                pressure: 0
            };
        }
    };

    addVoice = (voices, note) => {
        let i =  voices.findIndex(v => v.note === note);
        if (i < 0) {
            i = voices.push({
                timestamp: 0,
                note: note,
                // note_end: p.key,    // can be calculated
                z: Z_DEFAULT,
                bend: BEND_DEFAULT,
                y: Y_DEFAULT
            });
            i--;    // because push() returns the new length of the array and not the new index
        }
        return i;
    };

    removeVoice = (voices, note) => {
        const i = voices.findIndex(v => v.note === note);
        if (i >= 0) {
            // console.log(`remove voice ${i} note ${voices[i].note}`);
            voices.splice(i, 1);
        }
    };

    updateVoice = (voices, note, props) => {
        const i = this.addVoice(voices, note);
        Object.assign(voices[i], props);
    };

    handleMidiInputEvent = (e) => {

        if (e.data[0] === 0xF8) {
            // we ignore Timing Clock messages
            return;
        }
        const p = parseMidi(e.data);

        this.setState(produce(
            draft => {
                const i = p.channel - 1;
                switch (p.messageType) {

                    case "noteoff":
                        draft.ch[i].note_off = p.key;
                        if (draft.ch[i].note_on === p.key) {
                            draft.ch[i].note_on = -1;
                        }
                        // remove from the list of notes controlled by this channel:
                        if (draft.ch[i].notes.hasOwnProperty(p.key)) {
                            delete(draft.ch[i].notes[p.key]);
                        }
                        draft.ch[i].cc_num = -1;
                        draft.ch[i].bend = -1;
                        this.removeVoice(draft.voices, p.key);
                        break;

                    case "noteon":
                        draft.ch[i].note_on = p.key;
                        draft.ch[i].note_off = -1;
                        this.addNoteInChannel(draft.ch[i], p.key);
                        this.addVoice(draft.voices, p.key);
                        break;

                    case "keypressure":
                        if (this.state.z_cc_type === POLY_PRESS) {
                            this.updateVoice(draft.voices, p.key, {z: p.pressure});
                        }
                        break;

                    case "controlchange":
                        draft.ch[i].cc_num = p.controlNumber;
                        draft.ch[i].cc_val = p.controlValue === 0 ? '0' : (p.controlValue || '');
                        if (p.controlNumber === draft.y_cc) {   // here note is a string because it is the key of the object
                            for (const note in draft.ch[i].notes) {
                                this.updateVoice(draft.voices, parseInt(note, 10), {y: p.controlValue});
                            }
                        }
                        if (this.state.z_cc_type === CC11 && p.controlNumber === 11) {
                            // update pressure for all voices
                            draft.voices.forEach(voice => {
                                voice.z = p.controlValue;
                            })
                        }
                        break;

                    case "channelpressure":
                        draft.ch[i].chan_pressure = p.pressure;
                        if (this.state.z_cc_type === CHAN_PRESS) {
                            // update pressure for all voices
                            draft.voices.forEach(voice => {
                                voice.z = p.pressure;
                            })
                        }
                        break;

                    case "pitchbendchange":
                        draft.ch[i].bend = p.pitchBend;
                        for (const note in draft.ch[i].notes) {     // here note is a string because it is the key of the object
                            this.updateVoice(draft.voices, parseInt(note, 10), {bend: p.pitchBend});
                        }
                        break;

                    default:
                        // console.log("unknown message", p);
                }
            }
        ));

    };

    componentDidMount() {
        const s = loadPreferences();
        //if (s.bend_range) this.setBendRange(s.bend_range.toString(10));
        this.setState({
            bend_select: s.bend_select,
            bend_custom: s.bend_custom,
            y_cc: s.y_cc,
            z_cc_type: s.z_cc_type
        });
        this.setBendRange(s.bend_select);
    }

    render() {

        const ycc = [];
        for (let i=0; i<128; i++) {
            ycc.push(<option key={i} value={i}>CC {i}</option>);
        }

        return (
            <Provider state={state}>
{/*
                <div className={"warning-alpha"}>
                    Application under development. This is an alpha version.
                </div>
*/}
                <div className="app">
                    <Midi messageType={"midimessage"} onMidiInputEvent={this.handleMidiInputEvent}/>

                    <div className="header">
                        <MidiPortsSelect messageType={"midimessage"} onMidiInputEvent={this.handleMidiInputEvent} />
                        <div className="space-right">
                            <label>Pitch bend range:</label>
                            <select value={this.state.bend_select} onChange={this.setBendRange}>
                                <option value="2">+/- 2</option>
                                <option value="3">+/- 3</option>
                                <option value="12">+/- 12</option>
                                <option value="24">+/- 24</option>
                                <option value="48">+/- 48</option>
                                <option value="custom">custom</option>
                            </select>
                            {this.state.bend_select === "custom" &&
                            <input type="text" value={this.state.bend_custom} onChange={this.setBendCustom} size="3" className="space-right" />}
{/*
                            {bend_range_invalid &&
                            <div className="warning">
                                INVALID BEND RANGE
                            </div>}
*/}
                        </div>
                        <div>
                            <label>Pressure:</label>
                            <select value={this.state.z_cc_type} onChange={this.setZCC}>
                                <option value={CHAN_PRESS}>channel pressure</option>
                                <option value={POLY_PRESS}>poly pressure</option>
                                <option value={CC11}>CC 11</option>
                            </select>
                        </div>
                        <div>
                            <label>3rd dim.:</label>
                            <select value={this.state.y_cc} onChange={this.setYCC}>
                                {ycc}
                            </select>
                        </div>
{/*
                        <div>
                            <label>Master channel:</label>
                            <select value={this.state.master_channel} onChange={this.setMasterChannel}>
                                <option value="1">1</option>
                                <option value="16">16</option>
                            </select>
                        </div>
*/}
                        <div className="about">
                            <span className="bold">MPE Monitor {process.env.REACT_APP_VERSION}</span>
                            &nbsp;by&nbsp;<a href="https://studiocode.dev" target="_blank" rel="noopener noreferrer">StudioCode.dev</a>
                        </div>
                    </div>

                    <div className="content row">

                        <div className="">
                            <div className="xrow h15rem">
                                {/*<div className="float-right"><button className="bt-hide">hide</button></div>*/}
                                <button className="float-right" type="button" onClick={this.clearMessages}>clear</button>
                                <div className="bold space-right">MIDI messages</div>
                            </div>
                            <div className="channels-grid bg-white">
                                <div className="h c1">ch</div>
                                <div className="h">note on</div>
                                <div className="h">bend</div>
                                <div className="h">cc</div>
                                {/*<div className="h">note off</div>*/}
                                {/*<div className="h">notes with pressure</div>*/}
                                {this.state.ch.map(
                                    (ch, i) =>
                                        <Fragment key={i}>
                                            <div className="c1">{i+1}</div>
                                            <div className="f">
                                                <div>{ch.note_on >= 0 ? NOTE_NAME[ch.note_on] : ''}</div>
                                                <div>{ch.note_on >= 0 ? ch.note_on : ''}</div>
                                            </div>
                                            <div>{ch.bend >= 0 ? ch.bend : ''}</div>
                                            <div className="f">
                                                <div>{ch.cc_num >= 0 ? `${ch.cc_num}:` : ''}</div>
                                                <div>{ch.cc_num >= 0 ? ch.cc_val : ''}</div>
                                            </div>
{/*
                                            <div className="f">
                                                <div>{ch.note_off >= 0 ? NOTE_NAME[ch.note_off] : ''}</div>
                                                <div>{ch.note_off >= 0 ? ch.note_off : ''}</div>
                                            </div>
                                            <div>{Object.keys(ch.notes).map(
                                                (key, k) => <div key={key}>{ch.notes[key].note}, {ch.notes[key].pressure}</div>
                                            )}</div>
*/}
                                        </Fragment>
                                )}
                            </div>
                        </div>

                        <div className={this.state.display === DISPLAY_GRAPH ? 'fg' : ''}>
                            <div className="row h15rem">
                                <div className="bold space-right-xl">Voices</div>
                                <label className="space-right-l"><input type="radio" name="voice_display_mode" value={DISPLAY_DATA} checked={this.state.display === DISPLAY_DATA} onChange={this.setDisplayMode} /> data</label>
                                <label><input type="radio" name="voice_display_mode" value={DISPLAY_GRAPH} checked={this.state.display === DISPLAY_GRAPH} onChange={this.setDisplayMode} /> graph</label>
                            </div>

                            {this.state.display === DISPLAY_DATA &&
                            <div>
                                <div className="data-grid bg-white">
                                    <div className="h c1">note</div>
                                    <div className="h">bend</div>
                                    <div className="h">bended note</div>
                                    <div className="h">pressure</div>
                                    <div className="h">3rd dim.</div>
                                    {this.state.voices.map(
                                        (voice, i) => {
                                            const note = voice.note;
                                            const semi = this.getBendInSemitones(voice.bend);
                                            const note_bended = Math.round(note + semi);
                                            // const p = (256 - voice.pressure).toString(16);
                                            // const pres_bg = `#${p}${p}${p}`;
                                            return (
                                                <Fragment key={note}>
                                                    <div className="f c1">
                                                        <div>{NOTE_NAME[note]}</div>
                                                        <div>{note}</div>
                                                    </div>
                                                    <div>{semi.toFixed(1)}</div>
                                                    <div className="f">
                                                        <div>{NOTE_NAME[note_bended]}</div>
                                                        <div>{note_bended}</div>
                                                    </div>
                                                    <div>{voice.z}</div>
                                                    <div>{voice.y}</div>
                                                </Fragment>
                                            );
                                        }
                                    )}
                                </div>
                            </div>}

                            {this.state.display === DISPLAY_GRAPH &&
                            <div>
                                <div className="voice-rows">

                                {this.state.voices.map(
                                    (voice, i) => {
                                        const note = voice.note;
                                        const bend = voice.bend;
                                        const semi = this.getBendInSemitones(bend);
                                        const note_bended = Math.round(note + semi);
                                        const z = voice.z;
                                        const y = voice.y;

                                        // console.log(y, z, semi);

                                        const DISC_R = 20;
                                        const BOX_W = 600;
                                        const BEND_W = (BOX_W - 2*DISC_R) / 2;
                                        const BOX_H = 4*DISC_R;
                                        // const BEND_H = (BOX_H - 2*DISC_R) / 2;
                                        const BEND_H = DISC_R;
                                        // const fill = `hsla(0, 0%, ${80 * (127 - z) / 127}%)`;
                                        const fill = `hsla(240, 100%, ${50 * (1 - (z / 127))}%)`;

                                        return (
                                            <div key={i} className="voice-row">
                                                <div className="voice-graph bg-white">
                                                    <div className="voice-xyz">
                                                        <div><span className="xyz">X</span> {semi.toFixed(1)}</div>
                                                        <div><span className="xyz">Y</span> {y}</div>
                                                        <div><span className="xyz">Z</span> {z}</div>
                                                    </div>
                                                    <svg viewBox={`0 0 ${BOX_W} ${BOX_H}`} xmlns="http://www.w3.org/2000/svg">
{/*
                                                        <defs>
                                                            <radialGradient id={`myGradient${note}`}>
                                                                <stop offset={`${100 * z / 127}%`} stopColor={`hsla(0, 0%, ${80 * (127 - z) / 127}%)`} />
                                                                <stop offset="100%" stopColor="hsla(0, 0%, 100%)" />
                                                            </radialGradient>
                                                        </defs>
*/}
                                                        <line x1={DISC_R} y1={BOX_H/2} x2={BOX_W - DISC_R} y2={BOX_H/2} strokeWidth={0.8} />
                                                        <line x1={BOX_W/2} y1={DISC_R} x2={BOX_W/2} y2={DISC_R + 2*DISC_R} strokeWidth={0.8} />
                                                        <circle
                                                            cx={DISC_R + BEND_W + BEND_W * ((bend - 8192) / 8192)}
                                                            cy={DISC_R + 2 * BEND_H * ((127 - y) / 127)}
                                                            r={((DISC_R - 5) - 2) * z / 127 + 5}
                                                            stroke={fill} fill={fill} />
{/*
                                                        <circle
                                                            cx={DISC_R + BEND_W + BEND_W * ((bend - 8192) / 8192)}
                                                            cy={DISC_R + 2 * BEND_H * ((127 - y) / 127)}
                                                            r={DISC_R - 2}
                                                            stroke="#ccc" fill={`url(#myGradient${note})`} />
*/}
                                                        <text x={DISC_R + BEND_W + BEND_W * ((bend - 8192) / 8192)}
                                                              y={DISC_R + 2 * BEND_H * ((127 - y) / 127) + 5}>{NOTE_NAME[note_bended]}</text>
                                                    </svg>
                                                </div>
                                            </div>
                                        );
                                    }
                                )}
                                </div>
                                <div className={"graph-infos"}>
                                    <div>X is bend</div>
                                    <div>Y is 3rd dim.</div>
                                    <div>Z is pressure</div>
                                </div>
                            </div>}
                        </div>

                    </div>

{/*
                    <div>
                        <PianoKeyboard />
                    </div>
*/}
                </div>
            </Provider>
        );
    }

}

export default App;
