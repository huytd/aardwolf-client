var SafeBars = function (o) {
    console.log("SafeBars: module constructor called");

    var cv = { hp: 0, mana: 0, moves: 0, maxhp: 1, maxmana: 1, maxmoves: 1 };
    var cs = { enemy: "", enemypct: -1 };
    var win, id = "#safebars-window";

    var o = o || {
        title: 'Stats'
    };

    var process = function (d) {
        if (!d) return d;

        // Skip parsing if it's likely just text or HTML without GMCP markers
        // Socket.js sends raw strings to this event
        if (typeof d !== 'string' || !d.match(/^char\.|^comm\.|^room\./)) return d;

        try {
            var raw = d.match(/([^ ]+?) (.*)/);
            if (!raw) return d;

            var key = raw[1];
            var value = raw[2];

            // Log the raw GMCP for debugging
            console.log("SafeBars: received gmcp", key, value);

            var s = eval('(' + value + ')');

            if (key === 'char.vitals') {
                cv.hp = exists(s.hp) ? s.hp : cv.hp;
                cv.mana = exists(s.mana) ? s.mana : cv.mana;
                cv.moves = exists(s.moves) ? s.moves : cv.moves;
            }

            if (key === 'char.maxstats') {
                cv.maxhp = exists(s.maxhp) ? s.maxhp : cv.maxhp;
                cv.maxmana = exists(s.maxmana) ? s.maxmana : cv.maxmana;
                cv.maxmoves = exists(s.maxmoves) ? s.maxmoves : cv.maxmoves;
            }

            if (key === 'char.status') {
                cs.enemy = exists(s.enemy) ? s.enemy : cs.enemy;
                cs.enemypct = exists(s.enemypct) ? s.enemypct : cs.enemypct;
            }

            redraw();

        } catch (err) {
            console.error('SafeBars gmcp parse error:', err, 'Data:', d);
        }

        return d;
    };

    var draw = function () {
        win = new Window({
            id: id,
            title: o.title || 'Player Stats',
            'class': 'safebars-window nofade',
            transparent: 0,
            noresize: 0,
            css: {
                height: 160,
                width: 400,
                top: Config.top + 500 + 10,
                left: Config.left + Config.width + 10,
                zIndex: 200
            }
        });
        console.log("SafeBars: window instantiated", win);

        j(id + ' .content').append('\
            <style>\
                .safebars-container { padding: 10px; font-family: "Inter", sans-serif; }\
                .safebars-row { margin-bottom: 8px; }\
                .safebars-label { font-size: 11px; text-transform: uppercase; color: #aaa; margin-bottom: 2px; display: flex; justify-content: space-between; }\
                .safebars-bg { background: rgba(255,255,255,0.05); height: 12px; border-radius: 6px; overflow: hidden; position: relative; border: 1px solid rgba(255,255,255,0.1); }\
                .safebars-fill { height: 100%; transition: width 0.5s ease-out; border-radius: 6px; }\
                .safebars-fill.hp { background: linear-gradient(90deg, #ff416c, #ff4b2b); box-shadow: 0 0 10px rgba(255, 75, 43, 0.5); }\
                .safebars-fill.mana { background: linear-gradient(90deg, #4776e6, #8e54e9); box-shadow: 0 0 10px rgba(142, 84, 233, 0.5); }\
                .safebars-fill.moves { background: linear-gradient(90deg, #fcead3, #fccb90); box-shadow: 0 0 10px rgba(252, 203, 144, 0.5); }\
                .safebars-fill.enemy { background: linear-gradient(90deg, #cb2d3e, #ef473a); }\
                .safebars-value { font-weight: bold; color: #fff; }\
            </style>\
            <div class="safebars-container">\
                <div class="safebars-row">\
                    <div class="safebars-label">HP <span class="safebars-value hp-val">0 / 0</span></div>\
                    <div class="safebars-bg"><div class="safebars-fill hp" style="width: 0%"></div></div>\
                </div>\
                <div class="safebars-row">\
                    <div class="safebars-label">Mana <span class="safebars-value mana-val">0 / 0</span></div>\
                    <div class="safebars-bg"><div class="safebars-fill mana" style="width: 0%"></div></div>\
                </div>\
                <div class="safebars-row">\
                    <div class="safebars-label">Moves <span class="safebars-value moves-val">0 / 0</span></div>\
                    <div class="safebars-bg"><div class="safebars-fill moves" style="width: 0%"></div></div>\
                </div>\
                <div class="safebars-row enemy-row" style="display:none">\
                    <div class="safebars-label"><span class="enemy-name">No Target</span> <span class="safebars-value enemy-val">0%</span></div>\
                    <div class="safebars-bg"><div class="safebars-fill enemy" style="width: 0%"></div></div>\
                </div>\
            </div>\
        ');
    };

    var redraw = function () {
        var hpPct = Math.min(100, Math.max(0, (cv.hp / cv.maxhp) * 100));
        var manaPct = Math.min(100, Math.max(0, (cv.mana / cv.maxmana) * 100));
        var movesPct = Math.min(100, Math.max(0, (cv.moves / cv.maxmoves) * 100));

        j(id + ' .hp').css('width', hpPct + '%');
        j(id + ' .mana').css('width', manaPct + '%');
        j(id + ' .moves').css('width', movesPct + '%');

        j(id + ' .hp-val').text(cv.hp + ' / ' + cv.maxhp);
        j(id + ' .mana-val').text(cv.mana + ' / ' + cv.maxmana);
        j(id + ' .moves-val').text(cv.moves + ' / ' + cv.maxmoves);

        if (cs.enemy && cs.enemypct >= 0) {
            j(id + ' .enemy-row').show();
            j(id + ' .enemy-name').text(cs.enemy);
            j(id + ' .enemy-val').text(cs.enemypct + '%');
            j(id + ' .enemy').css('width', cs.enemypct + '%');
        } else {
            j(id + ' .enemy-row').hide();
        }
    };

    var handshake = function () {
        if (Config.Socket && Config.Socket.sendGMCP) {
            console.log("SafeBars: sending GMCP handshake");
            // Standard GMCP handshake: Hello then Supports.Set
            Config.Socket.sendGMCP('Core.Hello { "client": "Aardwolf Web Client", "version": "1.0" }');
            Config.Socket.sendGMCP('Core.Supports.Set [ "Char 1", "Char.Vitals 1", "Char.Status 1", "Char.Maxstats 1", "Comm 1", "Room 1" ]');
        } else {
            console.warn("SafeBars: Socket not ready for GMCP handshake");
        }
    };

    var parsePrompt = function (d) {
        if (!d || typeof d !== 'string') return d;

        // Pattern: [Fighting: 132/305hp 294/294mn 348/704mv 837tnl Enemy: 65% ]
        // Pattern: [289/289hp 278/278mn 685/686mv 0qt 243tnl]
        var match = d.match(/\[(?:Fighting:\s+)?(\d+)\/(\d+)hp\s+(\d+)\/(\d+)mn\s+(\d+)\/(\d+)mv.*?(?:Enemy:\s+(\d+)%)?\s*\]/i);
        if (match) {
            console.log("SafeBars: matched prompt", match[0]);
            cv.hp = parseInt(match[1]);
            cv.maxhp = parseInt(match[2]);
            cv.mana = parseInt(match[3]);
            cv.maxmana = parseInt(match[4]);
            cv.moves = parseInt(match[5]);
            cv.maxmoves = parseInt(match[6]);

            if (match[7] !== undefined) {
                cs.enemypct = parseInt(match[7]);
                if (!cs.enemy || cs.enemy === "No Target") {
                    cs.enemy = "Enemy";
                }
            }

            redraw();
        }
        return d;
    };

    Event.listen('gmcp', process);
    Event.listen('will_gmcp', handshake);
    Event.listen('before_display', parsePrompt);

    // Try handshake immediately
    handshake();

    draw();

    return {
        process: process,
        win: win
    };
};
