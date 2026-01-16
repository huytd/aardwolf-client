/*
 * Colorize.js is always included in the app page so you don't need to invoke it manually.
 * It is used internally by other modules, such as ScrollView.js
 * Adds ANSI 16-color codes and XTERM256 colors using span tags
 *
 * Extended by Michael Weller freshman@mud.tap.de or michael.weller@t-online.de
 * for * better ANSI compliance, working text attributes, different text sizes,
 * Graphical char set.
 *
 * Does also require a patched Socket.js and ScrollView.js
 *
 * Version 1.1a with a tiny patch on Ascii ShiftOut
 * Version 1.1b adds true colour support
 * Version 1.1c silly fix for true colour background colour
 */

/*
 * This relies on some style sheet extensions, if you cannot change the css
 * file, this code will add/modify the styles:
 *
 * // modify / extend existing css styles for upgraded Colorize.js

{   var lastSheet = document.styleSheets.length - 1;
    var numRules = document.styleSheets[lastSheet].cssRules.length;

    document.styleSheets[lastSheet].insertRule('.blinking{animation:blinkingText 2s infinite;}', numRules++);
    document.styleSheets[lastSheet].insertRule('@keyframes blinkingText{0%{opacity:0.0;} 50%{opacity:1.0;} 100%{opacity:0.0;}', numRules++);
    document.styleSheets[lastSheet].insertRule('body{line-height:16px;}', numRules++);
}

 */

var Colorize = function (o) {

        var flip = false, bold = '', italic = '', gmode = false;
        var under = '', flash = '', strike = '', lastspan = '';
        var color = '', bgcolor = '', buffer='', size ='';

        var ansi = {
                '30':           '#000',    //black
                '1;30':         '#6E6E6E', //bright black
                '31':           '#bf1b00', //red
                '1;31':         '#ff193f', //bright red
                '32':           '#00ac00', //green
                '1;32':         '#a1e577', //bright green
                '33':           '#DAA520', //yellow
                '1;33':         '#f3df00', //bright yellow
                '34':           '#1f68d5', //blue
                '1;34':         '#3680ee', //bright blue
                '35':           '#a501a7', //magenta
                '1;35':         '#e100e4', //bright magenta
                '36':           '#01c8d4', //cyan
                '1;36':         '#5bedf6', //bright cyan
                '37':           '#dbdbdb', //off-white
                '1;37':         '#fff; font-weight: 500',        //bright white
                '39':           '#dbdbdb',  //default
        };

        var bgansi = {
                '40':           '#000',    //black
                '1;40':         '#6E6E6E', //bright black
                '41':           '#bf1b00', //red
                '1;41':         '#ff193f', //bright red
                '42':           '#00ac00', //green
                '1;42':         '#a1e577', //bright green
                '43':           '#DAA520', //yellow
                '1;43':         '#f3df00', //bright yellow
                '44':           '#1f68d5', //blue
                '1;44':         '#3680ee', //bright blue
                '45':           '#a501a7', //magenta
                '1;45':         '#e100e4', //bright magenta
                '46':           '#01c8d4', //cyan
                '1;46':         '#5bedf6', //bright cyan
                '47':           '#dbdbdb', //off-white
                '1;47':         '#fff',    //bright white
                '49':           '#000',    //default
                '1;49':         '#6E6E6E', //brightblack
        };

        var graphchar = {
                '\017':         '',
                '\016':         '',
                '\x5f':         '&#x00A0;',
                '\x60':         '&#x25C6;',
                '\x61':         '&#x2592;',
                '\x62':         '&#x2409;',
                '\x63':         '&#x240C;',
                '\x64':         '&#x240D;',
                '\x65':         '&#x240A;',
                '\x66':         '&#x00B0;',
                '\x67':         '&#x00B1;',
                '\x68':         '&#x2424;',
                '\x69':         '&#x240B;',
                '\x6a':         '&#x2518;',
                '\x6b':         '&#x2510;',
                '\x6c':         '&#x250C;',
                '\x6d':         '&#x2514;',
                '\x6e':         '&#x253C;',
                '\x6f':         '&#x23BA;',
                '\x70':         '&#x23BB;',
                '\x71':         '&#x2500;',
                '\x72':         '&#x23BC;',
                '\x73':         '&#x23BD;',
                '\x74':         '&#x251C;',
                '\x75':         '&#x2524;',
                '\x76':         '&#x2534;',
                '\x77':         '&#x252C;',
                '\x78':         '&#x2502;',
                '\x79':         '&#x2264;',
                '\x7a':         '&#x2265;',
                '\x7b':         '&#x03C0;',
                '\x7c':         '&#x2260;',
                '\x7d':         '&#x00A3;',
                '\x7e':         '&#x00B7;',
        }

        var colors256 = ['#000', '#B00','#0B0','#BB0','#00B','#B0B','#0BB','#BBB','#555','#F55','#5F5','#FF5','#55F','#F5F','#5FF','#FFF','#000','#005','#008','#00B','#00D','#00F','#050','#055','#058','#05B','#05D','#05F','#080','#085','#088','#08B','#08D','#08F','#0B0','#0B5','#0B8','#0BB','#0BD','#0BF','#0D0','#0D5','#0D8','#0DB','#0DD','#0DF','#0F0','#0F5','#0F8','#0FB','#0FD','#0FF','#500','#505','#508','#50B','#50D','#50F','#550','#555','#558','#55B','#55D','#55F','#580','#585','#588','#58B','#58D','#58F','#5B0','#5B5','#5B8','#5BB','#5BD','#5BF','#5D0','#5D5','#5D8','#5DB','#5DD','#5DF','#5F0','#5F5','#5F8','#5FB','#5FD','#5FF','#800','#805','#808','#80B','#80D','#80F','#850','#855','#858','#85B','#85D','#85F','#880','#885','#888','#88B','#88D','#88F','#8B0','#8B5','#8B8','#8BB','#8BD','#8BF','#8D0','#8D5','#8D8','#8DB','#8DD','#8DF','#8F0','#8F5','#8F8','#8FB','#8FD','#8FF','#B00','#B05','#B08','#B0B','#B0D','#B0F','#B50','#B55','#B58','#B5B','#B5D','#B5F','#B80','#B85','#B88','#B8B','#B8D','#B8F','#BB0','#BB5','#BB8','#BBB','#BBD','#BBF','#BD0','#BD5','#BD8','#BDB','#BDD','#BDF','#BF0','#BF5','#BF8','#BFB','#BFD','#BFF','#D00','#D05','#D08','#D0B','#D0D','#D0F','#D50','#D55','#D58','#D5B','#D5D','#D5F','#D80','#D85','#D88','#D8B','#D8D','#D8F','#DB0','#DB5','#DB8','#DBB','#DBD','#DBF','#DD0','#DD5','#DD8','#DDB','#DDD','#DDF','#DF0','#DF5','#DF8','#DFB','#DFD','#DFF','#F00','#F05','#F08','#F0B','#F0D','#F0F','#F50','#F55','#F58','#F5B','#F5D','#F5F','#F80','#F85','#F88','#F8B','#F8D','#F8F','#FB0','#FB5','#FB8','#FBB','#FBD','#FBF','#FD0','#FD5','#FD8','#FDB','#FDD','#FDF','#FF0','#FF5','#FF8','#FFB','#FFD','#FFF','rgb(8,8,8)','rgb(18,18,18)','rgb(28,28,28)','rgb(38,38,38)','rgb(48,48,48)','rgb(58,58,58)','rgb(68,68,68)','rgb(78,78,78)','rgb(88,88,88)','rgb(98,98,98)','rgb(108,108,108)','rgb(118,118,118)','rgb(128,128,128)','rgb(138,138,138)','rgb(148,148,148)','rgb(158,158,158)','rgb(168,168,168)','rgb(178,178,178)','rgb(188,188,188)','rgb(198,198,198)','rgb(208,208,208)','rgb(218,218,218)','rgb(228,228,228)','rgb(238,238,238)'];

        var stripANSI = function(t) {
                return t.replace(/\033\[[0-9;]+?m|\033\[2J|\033\[0c|\033\)B|\033\(0|\033#[0-9]/g,'');
        }

        var colorize = function(t) {
                var prevspan;

                // console.log('Colorize received: '+t);

                // future: check also for CLS etc..pp

                if (buffer) {
                        t = buffer + t;
                        buffer = '';
                }

                prevspan = lastspan;

                // check if there is a partial escape seq at the end and buffer it:
                t = t.replace(/\033([^a-zA-Z]{0,20})$/, function(seq, c, off, str) {
                                buffer = seq;
                                return '';
                        }
                );
                t = t.replace(/\033\[([0-9;]+)m|\n|\033#[3-6]/g, function(seq, c, off, str) {
                        var v = '</span><span';
                        if (c == undefined)
                                c = seq;
                        c = c.split(';');

                        //console.log('c[' + c.join(', ') + ']');
                        if (!c.length)
                                c = ['0']; // ESC [ m defaults to ESC [ 0 m

                        for (var a = 0; a < c.length; a++) {
                                var dcol, dbgcol;

                                //console.log('c[a]=' + c[a]);
                                switch(c[a]) {
                                        case '\n':
                                                if (!size)
                                                        return '\n';
                                                size='';
                                                v = '</span>\n<span';
                                                break;
                                        case '\033#3':
                                                size=' visibility:hidden;';
                                                break;
                                        case '\033#4':
                                                size=' display:inline-block;font-size:200%;height=9px;transform:translateY(-9px);';
                                                break;
                                        case '\033#5':
                                                size='';
                                                break;
                                        case '\033#6':
                                                size=' display:inline-block;font-size:200%;transform:scaleY(0.5);';
                                                break;
                                        case '0':
                                                bold = italic = flash = under = strike = '';
                                                color = bgcolor = '';
                                                flip = false;
                                                break;
                                        case '1':
                                                bold = ' font-weight: 500;';
                                                break;
                                        case '3':
                                                italic = ' font-style: italic;';
                                                break;
                                        case '4':
                                                under = ' text-decoration: underline;';
                                                break;
                                        case '5':
                                                flash = ' class=\"blinking\"';
                                                break;
                                        case '7':
                                                flip = true;
                                                break;
                                        case '9':
                                                strike = ' text-decoration: line-through;';
                                                break;
                                        case '22':
                                                bold = '';
                                                break;
                                        case '23':
                                                italic = '';
                                                break;
                                        case '24':
                                                under = '';
                                                break;
                                        case '25':
                                                flash = '';
                                                break;
                                        case '27':
                                                flip = false;
                                                break;
                                        case '29':
                                                strike = '';
                                                break;
                                        case '38':
                                        case '48':
                                                if ((a + 2 < c.length) && (c[a+1] == '5')) {
                                                        if (c[a] == 38) {
                                                                color = 'color:'+colors256[parseInt(c[a+2])]+';';
                                                        }
                                                        else {
                                                                bgcolor = ' display:inline-block; height=1; background-color:'+
                                                                        colors256[parseInt(c[a+2])]+';';
                                                        }
                                                        a += 2;
                                                } else if ((a + 4 < c.length) && (c[a+1] == '2')) {
                                                        if (c[a] == 38) {
                                                                color = 'color:#'+Number(c[a+2]).toString(16).padStart(2, '0') +
                                                                   Number(c[a+3]).toString(16).padStart(2, '0') +
                                                                   Number(c[a+4]).toString(16).padStart(2, '0') + ";"
                                                        }
                                                        else {
                                                                bgcolor = ' display:inline-block; height=1; background-color:#'+
                                                                   Number(c[a+2]).toString(16).padStart(2, '0') +
                                                                   Number(c[a+3]).toString(16).padStart(2, '0') +
                                                                   Number(c[a+4]).toString(16).padStart(2, '0') + ';';
                                                        }
                                                        a += 4;
                                                }
                                                break;
                                        default:
                                                if (ansi[c[a]]) {
                                                        color = 'color:'+ansi[(bold ? '1;'+c[a] : c[a])]+';';
                                                }
                                                else
                                                if (bgansi[c[a]]) {
                                                        bgcolor = ' display:inline-block; height=1; background-color:'+
                                                                        bgansi[(bold ? '1;'+c[a] : c[a])]+';';
                                                }
                                                // ignore any unknown sequence
                                                break;
                                }
                        }

                        dcol = color;
                        dbgcol = bgcolor;

                        if (flip) {
                                if (!color)
                                        dbgcol = ' background-color:' + ansi[bold ? '1;39' : '39']+';';
                                else
                                        dbgcol = color.replace("color:", 'background-color:');
                                if (!bgcolor)
                                        dcol = ' color:' + bgansi[bold ? '1;49' : '49']+';';
                                else
                                        dcol = bgcolor.replace("background-color:", 'color:');
                        }
                        if (dcol || dbgcol || bold || italic || under || flash || strike || size) {
                                v = lastspan = v + flash + ' style="' + size + dcol + dbgcol + bold + italic + under + strike + '">';
                        } else {
                                v += '>'; // default text attributes
                                lastspan = '';
                        }
                        // console.log(v);
                        return v;
                        }
                );

                t = t.replace(/\033\[2J/g,'');
                t = t.replace(/\033\[0c/g,'');
                t = t.replace(/\033\)B/g,'');
                t = t.replace(/\033\(0/g,'');

                if (prevspan)
                        t = prevspan + t;
                if (gmode || t.has('\017')) {
                        t = t.replace(/(^|>)[^<]*(<|$)/g, function(seq, c1, c2, off, str) {
                                if (gmode)
                                        seq = '\017' + seq;
                                return seq.replace(/\017[^\016]*(\016|$)/g, function(seq, c1, off, str) {
                                        // console.log('secondary replace("'+seq+'","'+c1+'")');
                                        gmode = true;
                                        return seq.replace(/[\016\017_-~]/g, function(seq, off, str) {
                                                if (seq == '\016') {
                                                        gmode = false;
                                                        return '';
                                                }
                                                return graphchar[seq];
                                        } );
                                } );
                        } );
                } else {
                        // remove unexpected shiftouts
                        t = t.replace(/\016+/g, '');
                }
                // console.log('after colorize: \"'+t+'\"');

                return t;
        }

        var process = function(t) {

                if (!buffer && !lastspan && !gmode && !t.has('\033') &&
                        !t.has('\017') && (size && t.has('\n')))
                        return t;

                t = colorize(t);

                return t;
        }

        return {
                process: process,
                strip: stripANSI
        }

}


