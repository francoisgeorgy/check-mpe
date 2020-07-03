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
    loadPreferences, POLY_PRESS,
    savePreferences,
    Y_DEFAULT,
    Z_DEFAULT
} from "./utils/preferences";
import './App.css';

class App extends Component {

    state = {
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

        key_pressure: false


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
                        draft.key_pressure = true;
                        // if (this.state.z_cc_type === POLY_PRESS) {
                        //     this.updateVoice(draft.voices, p.key, {z: p.pressure});
                        // }
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
        // //if (s.bend_range) this.setBendRange(s.bend_range.toString(10));
        // this.setState({
        //     bend_select: s.bend_select,
        //     bend_custom: s.bend_custom,
        //     y_cc: s.y_cc,
        //     z_cc_type: s.z_cc_type
        // });
        // this.setBendRange(s.bend_select);
    }

    render() {

        const ycc = [];
        for (let i=0; i<128; i++) {
            ycc.push(<option key={i} value={i}>CC {i}</option>);
        }

        return (
            <Provider state={state}>
                <div className="app">
                    <Midi messageType={"midimessage"} onMidiInputEvent={this.handleMidiInputEvent}/>

                    <div className="header">
                        <MidiPortsSelect messageType={"midimessage"} onMidiInputEvent={this.handleMidiInputEvent} />
                        <div className="about">
                            <span className="bold">MPE Monitor {process.env.REACT_APP_VERSION}</span>
                            &nbsp;by&nbsp;<a href="https://studiocode.dev" target="_blank" rel="noopener noreferrer">StudioCode.dev</a>
                        </div>
                    </div>

                    <div className="content row">
                        Play with your MPE controller...
                    </div>

                    <div className="content row">
                        <div>MIDI messages received</div>
                        <div>pressure: </div>
                        <div>bend range: </div>
                        <div>3rd dim: </div>
                    </div>

                </div>
            </Provider>
        );
    }

}

export default App;
