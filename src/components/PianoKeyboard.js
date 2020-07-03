import React, {useCallback, useEffect, useState} from 'react'
// import {observer} from 'mobx-react'
// import {useStores} from "../hooks/useStores";
// import {isAccidental, NOTE_NAME, NOTE_NAME_NO_OCTAVE, octave} from "../utils/midiNotes";
// import {MIDI_VOICE_NOTE_OFF, MIDI_VOICE_NOTE_ON, parseMidiMessage} from "../utils/midi";
import "./PianoKeyboard.css";
import {NOTE_NAME, NOTE_NAME_NO_OCTAVE} from "../utils/midi";

// start   accidentals up to the end of the octave
// -----------------------------------------------
// C       5   C# D# F# G# A#
// C#      5
// D       4
// D#      4
// E       3
// F       3
// F#      3
// G       2
// G#      2
// A       1
// A#      1
// B       0

const PIANO_KEYBOARD_PRESETS = {
    '25' : [NOTE_NAME.indexOf('C3'), NOTE_NAME.indexOf('C5')],
    '37' : [NOTE_NAME.indexOf('C3'), NOTE_NAME.indexOf('C6')],
    '49' : [NOTE_NAME.indexOf('C2'), NOTE_NAME.indexOf('C6')],
    '61' : [NOTE_NAME.indexOf('C2'), NOTE_NAME.indexOf('C7')],
    '76' : [NOTE_NAME.indexOf('E1'), NOTE_NAME.indexOf('G7')],
    '88' : [NOTE_NAME.indexOf('A0'), NOTE_NAME.indexOf('C8')],
    '88-1' : [NOTE_NAME.indexOf('A-1'), NOTE_NAME.indexOf('C7')],
    'Linn128' : [NOTE_NAME.indexOf('F#0'), NOTE_NAME.indexOf('G#4')],   // Pitch range: 4 octaves (51 overlapping pitches, F#0 to G#4, in default Fourths tuning)
    'Linn200' : [NOTE_NAME.indexOf('F#0'), NOTE_NAME.indexOf('F5')]     // Pitch range: 5 octaves (60 overlapping pitches, F#0 to F5, in default Fourths tuning)
};

// index 0 is C
const ACCIDENTALS_FROM = [
    5, 5, 4, 4, 3, 3, 3, 2, 2, 1, 1, 0
];

function isAccidental(note) {
    switch (note % 12) {
        case 1:
        case 3:
        case 6:
        case 8:
        case 10:
            return true;
        default:
            return false;
    }
}

function octave(note) {
    return Math.floor(note / 12);
}

function numberOfOctaves(fromNote, toNote) {
    return Math.abs(Math.floor(toNote / 12) - Math.floor(fromNote / 12));
}

function numberOfAccidentals(fromNote, toNote) {
    const modFrom = fromNote % 12;
    const modTo = toNote % 12;

    const aFrom = ACCIDENTALS_FROM[modFrom];
    const aTo = ACCIDENTALS_FROM[modTo];

    const corr = (aFrom === aTo) && (Math.abs(modFrom - modTo) === 1) ? 1 : 0;

    return aFrom - aTo + corr + numberOfOctaves(fromNote, toNote) * 5;
}

function numberOfWhiteKeys(fromNote, toNote) {
    const semitones = toNote - fromNote + 1;
    return semitones - numberOfAccidentals(fromNote, toNote);
}

function PianoKey({note, keyIndex, offset, nWhiteKeys}) {

    // C  #  D  #  E  F  #  G  #  A  #  B  C  #  D  #  E  F  #  G  #  A  #  B  C
    // 0  1  2  3  4  5  6  7  8  9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30
    // 0     1     2  3     4     5     6  7     8     9 10    11    12    13 14
    //    0     1        3     4     5        0     1        3     4     5

    const ww = 100 / nWhiteKeys;    // white-keys width
    const wb = ww * 0.66;           // black-keys width

    let inlineStyle;
    let xIndex = keyIndex;
    let acc = false;
    const oct = octave(keyIndex);
    switch (keyIndex % 12) {    // switch on position in octave (C is 0)
        case 0:                 // C
            xIndex = oct*7;
            break;
        case 1:                 // C#
            xIndex = oct*7;
            acc = true;
            break;
        case 2:                 // D
            xIndex = (oct*7) + 1;
            break;
        case 3:                 // D#
            xIndex = (oct*7) + 1;
            acc = true;
            break;
        case 4:                 // E
            xIndex = (oct*7) + 2;
            break;
        case 5:                 // F
            xIndex = (oct*7) + 3;
            break;
        case 6:                 // F#
            xIndex = (oct*7) + 3;
            acc = true;
            break;
        case 7:                 // G
            xIndex = (oct*7) + 4;
            break;
        case 8:                 // G#
            xIndex = (oct*7) + 4;
            acc = true;
            break;
        case 9:                 // A
            xIndex = (oct*7) + 5;
            break;
        case 10:                // A#
            xIndex = (oct*7) + 5;
            acc = true;
            break;
        case 11:                // B
            xIndex = (oct*7) + 6;
            break;
    }

    const b = 2;

    let x;

    let blackKeyClass = '';
    if (acc) {
        blackKeyClass = 'piano-key-black';
        x = (xIndex - offset) * ww + ww/2 + ((ww-wb)/2);
        inlineStyle = {
            left: `${x}%`,
            width: `calc(${wb}% - ${b*2}px)`,
        };
    } else {
        x = (xIndex - offset) * ww;  // + 2;
        inlineStyle = {
            left: `calc(${x}% + ${b}px)`,
            width: `calc(${ww}% - ${b*2}px)`,
        };
    }

    return (
        <div className={`piano-key ${blackKeyClass}`} style={inlineStyle}>
            <div className="i">
                {note % 12 ? NOTE_NAME_NO_OCTAVE[note % 12] : NOTE_NAME[note]}
            </div>
        </div>
    );
}


export const PianoKeyboard = () => {

    let [fromNote, toNote] = PIANO_KEYBOARD_PRESETS['61'];

    let disableFirstNote = false;
    let disableLastNote = false;

    // if the first note is an accidental we add a white key just before
    // console.log("first note", fromNote);
    if (isAccidental(fromNote)) {
        // console.log("fromNote--");
        fromNote = fromNote - 1;
        disableFirstNote = true;
    }

    // if the last note is an accidental we add a white key just after
    if (isAccidental(toNote)) {
        toNote = toNote + 1;
        disableLastNote = true;
    }


    const nWhiteKeys = numberOfWhiteKeys(fromNote, toNote);
    let k = fromNote % 12;  // starting index (C=0)
    let offset = numberOfWhiteKeys(Math.floor(fromNote / 12) * 12, fromNote) - 1;   // number of white keys offset from C (D=1, E=2, F=3, ...)

    // const [rangeFrom, rangeTo] = PIANO_KEYBOARD_PRESETS[range];

    const keys = [];

    for (let note = fromNote; note <= toNote; note++) {
        keys.push(<PianoKey key={note}
                            keyIndex={k++}
                            offset={offset}
                            nWhiteKeys={nWhiteKeys}
                            note={note} />);
    }

    return (
        <div className={"piano-wrapper"}>
           <div className="piano-keyboard">
                <div className="piano-keys">
                    {keys}
                </div>
            </div>
        </div>
    )

};