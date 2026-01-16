/*
 * Version 2.1    04/16/2021
 *
 * 2.0  - Major rewrite
 * 2.0a-d - minor changes, not recorded here
 * 2.0e - Allow &text; entity in system elements, proper handling of empty parameters for custom
 *        elements, allow resetting out of dead lock with secure tags with unfinished string
 *        params.
 * 2.0f - improve handling of fname and url in IMAGE, better default hint for SEND menus
 *        VERSION <style> just sets, does not return version (like CMud)
 * 2.1  - Support for <SOUND> and <MUSIC>
 *
 * An attempt for a standard compliant MXP module, loosely based on 1.3 but largely rewritten by
 * Michael Weller freshman@mud.tap.de michael.weller@t-online.de
 *
 * It does full open/secure/locked mode interaction, complex !el !en usage. It does not support
 * tags and related commands. no VAR element. Frame cannot redirect, dest cannot EOF or EOL and
 * X and Y behave different from the standard.
 *
 * Does also require a patched Socket.js and ScrollView.js
 *
*/

/*
 * If you load this using an init script in the portal for your own mud, you must deregister the
 * preloaded MXP module:

// deregister any loaded mxp module: (try it at least)
if (Config.mxp) {
    Event.drop('internal_mxp', Config.mxp.process);
}
j('body').off('click', '.mxp');
j('body').off('touchend contextmenu', '.mxp');
// we silently accept that a send menu is silently closed twice: doesn't matter

 */

var MXP = function () {

        var mxp = 0, elements = {}, entities = {};
        var buffer = '', defmode = 0, curmode = 0;
        var mxp_style = '', in_forced_reset = false;

        var sound = {
                url: 0,
                fname: 0,
                prio: 0,
                audio: 0,
                loop: 1,
        };

        var music = {
                url: 0,
                fname: 0,
                audio: 0,
                loop: 1,
        };

        /*
         * The tags object uses a bitmap for properties of known tags.
         * Those with a '.' inside are for use by support only. This is
         * old school, but some real object stuff seems a waste of memory and
         * over kill. Values are logical ors of:
         * 1 - can be used (w/o this bit shows only in support-tag)
         * 2 - empty tag w/o a closing tag. (value 2 implies 1)
         * 4 - secure tag
         * 8 - user defined, can be redefined or removed
         */

        var tags = {
                "nobr" : 3, "p" : 3, "br" : 3, "sbr" : 3, "expire" : 7,
                "!at" : 7, "!attlist" : 7,
                "at" : 0, "attlist" : 0,
                "!en" : 7, "!entity" : 7, "!el" : 7, "!element" : 7,
                "en" : 0, "entity" : 0, "el" : 0, "element" : 0,
                'en.desc' : 0, 'en.private' : 0, 'en.publish' : 0, 'en.delete' : 0, 'en.add' : 0, 'en.remove' : 0,
                'entity.desc' : 0, 'entity.private' : 0, 'entity.publish' : 0, 'entity.delete' : 0, 'entity.add' : 0, 'entity.remove' : 0,
                'element.flag' : 0, 'element.att' : 0, 'element.open' : 0, 'element.delete' : 0, 'element.empty' : 0,
                'el.flag' : 0, 'el.att' : 0, 'el.open' : 0, 'el.del' : 0, 'el.empty' : 0,
                "version" : 7, "support" : 7,
                'image' : 7, 'image.url' : 0,
                'image.fname' : 0, 'image.h' : 0, 'image.w' : 0, 'image.t' : 0, 'image.align' : 0,
                'image.hspace' : 0, 'image.vspace' : 0, 'image.hint' : 0,
                'send' : 5, 'send.href' : 0, 'send.hint' : 0, 'send.prompt' : 0, 'send.expire' : 0,
                'color' : 1, 'c' : 1, 'font' : 1,
                'font.color' : 0, 'font.back' : 0, 'font.face' : 0, 'font.size' : 0,
                'color.fore' : 0, 'color.back' : 0,
                'c.fore' : 0, 'c.back' : 0,
                'b' : 1, 'bold' : 1, 'strong' : 1, 'i' : 1, 'italic' : 1, 'em' : 1,
                'u' : 1, 'underline' : 1, 'h' : 1, 'high' : 1, 's' : 1, 'strikeout' : 1,
                'a' : 5, 'a.href' : 0, 'a.hint' : 0, 'a.expire' : 0,
                'frame' : 7, 'dest' : 5,
                'frame.action' : 0, 'frame.open' : 0, 'frame.eof' : 0, 'frame.close' : 0,
                'frame.title' : 0, 'frame.width' : 0, 'frame.height' : 0, 'frame.top' : 0, 'frame.left' : 0,
                'frame.align' : 0, 'frame.name' : 0, 'frame.parent' : 0,
                'sound' : 7, 'sound.v' : 0, 'sound.l' : 0, 'sound.u' : 0, 'sound.p' : 0,
                'music' : 7, 'music.v' : 0, 'music.l' : 0, 'music.u' : 0, 'music.c' : 0,
        };

        var soundended = function() {
                if ((sound.loop < 0) || (--sound.loop > 0)) {
                        sound.audio.play();
                        return;
                }
                sound.fname = sound.prio = sound.audio = 0;
        }

        var musicended = function() {
                if ((music.loop < 0) || (--music.loop > 0)) {
                        music.audio.play();
                        return;
                }
                music.fname = music.audio = 0;
        }

        var prep = function(t) {

                t = new Colorize()
                        .process(t)
//                      .replace(/\x1b\[[1-7]z/g, '')
                        .replace(/\r/g,'')
                        .replace(/\n/g,'<br>');

                t = t.replace(/\x1b>/g,'>');
                t = t.replace(/\x1b</g,'<');

                return t;
        };

        // one could argue that this should be taken from Colorize.. but it is plain simple and
        // to get it from there would need quite some global code reorg.
        //
        var stripANSI = function(t) {
                return t.replace(/\033\[[0-9;]+?m|\033\[2J|\033\[0c|\033\)B|\033\(0|\033#[0-9]/g,'');
        }

        var wraparg = function(arg, always) {
                if (arg.match(/'/))
                        return '"' + arg + '"';
                if (arg.match(/["\s]/) || always)
                        return "'" + arg + "'";
                return arg;
        }

        var scanargs = function(args, atts, def, dontLower) {
                var arglist = {}, i;

                if (def)
                        arglist = def;
                if (!args)
                        return arglist;
                i = 0;
                if (!atts)
                        atts = [];
                args.replace(/([A-Z_][-0-9A-Z_]*=?)?([^"'\s]\S*|"[^"]*"|'[^']*')?/gi,
                        function(match, p1, p2, offset, string){
                                if (!match)
                                        return '';
                                if (!p2)
                                        p2 = '';
                                else if(p2.match(/^["']/))
                                        p2 = p2.slice(1,-1);
                                if (p1) {
                                        if (!dontLower)
                                                p1 = p1.toLowerCase();
                                        if (p1.match(/=$/)) {
                                                p1 = p1.replace('=', '');
                                                i = atts.indexOf(p1) + 1;
                                                if (!i)
                                                        i = atts.length;
                                                if (p2 || !arglist.hasOwnProperty(p1))
                                                        arglist[p1] = p2 || true;
                                        } else {
                                                // single word param, known flag?
                                                //
                                                offset = atts.indexOf(p1);
                                                if (offset >= 0) {
                                                        arglist[p1] = true;
                                                        i = offset + 1;
                                                } else if (i < atts.length) // can be assigned as stdarg?
                                                        arglist[atts[i++]] = p1;
                                                else
                                                        arglist[p1] = true;
                                        }
                                } else {
                                        // single word param:
                                        arglist[(i < atts.length) ? atts[i++] : i++] = p2
                                }
                        });
                return arglist;
        }

        var scanattlist = function(arg) {
                var att = [], def = {};
                if (arg) {
                        arg.replace(/([a-z_][a-z0-9_]*)(?:=([^'"\s]*|'[^']*'|"[^"]*"))?/gi, function(m, p1, p2, offset, str) {
                                att.push(p1);
                                if (p2) {
                                        if (p2.match(/^["']/))
                                                p2.slice(1, -1);
                                } else {
                                        p2 = '';
                                }
                                def[p1] = p2;
                        });
                }
                return {'att': att, 'def': def};
        }

        var userelement = function(tag, arg, text) {
                var desc, def, argobj, i, res = '';

                if ((!(tags[tag]&8)) || !(desc = elements[tag]))
                        return text; // unknown element
                argobj = scanargs(arg, desc[2].att, Object.assign({}, desc[2].def), true);
                argobj['text'] = stripANSI(res = text);
                def = replace_ent(desc[1], argobj);
                // split definition into an array of <> or plain text, limited support for \e< in definition, but.. better no.
                def = def.match(/\033.|\033$|<(?:[^'">]+|'[^']*'|"[^"]*")*>|[^\033<]*/gi);
                // now work through this from the reverse: note we dont check for open / secure mode. You can define an open tag using secure ones
                for (i = def.length - 1; i >= 0; i--) {
                        if (def[i].charAt(0) != '<') {
                                res = def[i] + res;
                                continue;
                        }
                        // console.log('Eval ' + i + ':"' + def[i] + '"');
                        desc = def[i].slice(1, -1);
                        desc = desc.match(/^\s*([a-z_][a-z0-9_]*)\s*(.*)/i);
                        if (!desc)
                                continue;
                        tag = desc[1];
                        if (!tags[tag]) { // system tag in wrong capitalization?
                                tag = tag.toLowerCase();
                        }
                        argobj = tags[tag];
                        if (!argobj)
                                continue;
                        if (argobj & 2) {
                                if (tag.charAt(0) != '!') // no tag definition in an element
                                        res = emptytagexec(tag, desc[2] || '') + res;
                        } else {
                                res = tagexec(tag, desc[2] || '', res);
                        }
                }
                return res;
        }

        var emptytagexec = function(tag, arg, ent_updated, el_updated) {
                var myarg={};

                switch(tag) {
                        case 'nobr': return '&nbsp;';
                        case 'br': return '\033<BR/\033>';
                        case 'sbr': return '\033<WBR/\033>';
                        case 'p': return '\033<P/\033>';
                        case 'version' :
                                myarg = scanargs(arg, ["style"]);
                                if ((typeof myarg.style == 'string') && myarg.style) {
                                        mxp_style = " STYLE=" + wraparg(myarg.style);
                                        return ''; // just set
                                } else if ('style' in myarg) { // must be ''
                                        mxp_style = '';
                                        return ''; // just set
                                }
                                return "\033[1z<VERSION MXP=1.0" + mxp_style +
                                        " CLIENT=mudportal VERSION=2.1>\n";
                        case 'support' :
                                if (!arg) {
                                        tag = '+' + Object.keys(tags).filter(function(s) {
                                                return !((tags[s] & 8) || s.match(/\W/));
                                        }).sort().join(' +');
                                } else {
                                        arg = arg.replace(/['"]/g, '');
                                        arg = arg.replace(/\s+/g, ' ');
                                        arg = arg.toLowerCase();
                                        tag = arg.replace(/\S+/g, function(m, o, s) {
                                                s = m.length - 1;
                                                if (m.substr(s - 1) == '.*') {
                                                        m = m.substr(0, s);
                                                        o = Object.keys(tags).filter(function(f) {
                                                                return (m == f.substr(0, s)) && !(tags[s] & 8);
                                                        }).sort().join(' +');
                                                        if (o)
                                                                o = '+' + o;
                                                        else
                                                                o = '-' + m.substr(0, s - 1);
                                                        return o;
                                                } else {
                                                        return (((m in tags) && !(tags[m] & 8)) ? '+' : '-') + m;
                                                }
                                        });
                                }
                                return "\033[1z<SUPPORTS " + tag + ">\n";
                        case 'image':
                                myarg = scanargs(arg, ['fname', 'url', 't', 'h', 'w', 'hspace', 'vspace', 'align', 'hint'], {'fname':'', 'url':'', 't':'', 'h':'', 'w':'', 'hspace':'', 'vspace':'', 'align':'', 'hint':'',});
                                arg = '\033<img';
                                if (myarg.url) {
                                        if (myarg.fname) {
                                                if (!myarg.fname.match(/^[a-z]+:/))
                                                        arg += ' src=' + wraparg(myarg.url.replace(/\/*$/, "/" + myarg.fname), true);
                                                else    arg += ' src=' + wraparg(myarg.fname, true);
                                        } else {
                                                arg += ' src=' + wraparg(myarg.url, true);
                                        }
                                } else if (myarg.fname)
                                        arg += ' src=' + wraparg(myarg.fname, true);
                                if (myarg.hint)
                                        arg += ' alt=' + wraparg(myarg.hint)
                                                + ' title=' + wraparg(myarg.hint);
                                arg += ' style="display:inline-block;';
                                if (myarg.h) {
                                        if (myarg.h.match(/^[0-9]+$/))
                                                myarg.h += 'px';
                                        arg += 'height:' + wraparg(myarg.h) + ';';
                                }
                                if (myarg.w) {
                                        if (myarg.w.match(/^[0-9]+$/))
                                                myarg.w += 'px';
                                        arg += 'width:' + wraparg(myarg.w) + ';';
                                }
                                if (myarg.hspace) {
                                        if (myarg.hspace.match(/^[0-9]+$/))
                                                myarg.hspace += 'px';
                                        arg += 'padding-left:' + myarg.hspace
                                                + ';padding-right:' + myarg.hspace + ';';
                                }
                                if (myarg.vspace) {
                                        if (myarg.vspace.match(/^[0-9]+$/))
                                                myarg.vspace += 'px';
                                        arg += 'padding-top:' + myarg.vspace
                                                + ';padding-bottom:' + myarg.vspace + ';';
                                }
                                switch(myarg.align.toLowerCase()) {
                                        case 'l':
                                        case 'left':
                                                arg += 'text-align:left;'; break;
                                        case 'r':
                                        case 'right':
                                                arg += 'text-align:right;'; break;
                                        case 't':
                                        case 'top':
                                                arg += 'vertical-align:top;'; break;
                                        case 'b':
                                        case 'bottom':
                                                arg += 'vertical-align:bottom;'; break;
                                        case 'm':
                                        case 'middle':
                                                arg += 'vertical-align:middle;'; break;
                                }
                                return arg + '"\033>';
                        case 'expire':
                                myarg = arg.match(/[^"'\s]+|"[^"]*"|'[^']*'/); // chop one string, possibl enclosed in quotmarks
                                // build jQuery arg:
                                if (myarg && myarg != '""' && myarg != "''")
                                        myarg = "a[mxp_expire=" + myarg + "]";
                                else
                                        myarg = "a[mxp_expire]";
                                j(myarg).each(function(index, value) {
                                        // make it inactive and look like normal text
                                        // rather than make it look like whatever, just make it normal text
                                        // add an expired_mxp class if one wants a special look:
                                        j(this).replaceWith('<span class="expired_mxp">' + this.innerHTML + '</span>');
                                });
                                return '';
                        case '!en':
                        case '!entity':
                                tag = arg.match(/^\s*([a-z_][a-z_0-9]*)\s+([^'"\s]\S*|'[^']*'|"[^"]*")(.*)$/i);
                                if (!tag)
                                        return '';
                                myarg = scanargs(tag[3], ['desc', 'private', 'publish', 'delete', 'add', 'remove'], {});
                                if (myarg.delete) {
                                        delete entities[tag[1]];
                                        return '';
                                }
                                if (tag[2].match(/^['"]/))
                                        tag[2] = tag[2].slice(1,-1);
                                if (myarg.add) {
                                        tag[2] = (entities[tag[1]][1] || '') + '|' + (tag[2] || '');
                                } else if (myarg.remove) {
                                        tag[2] = tag[2] || '';
                                        tag[2] = (entities[tag[1]][1] || '').split('|').filter(word => word != tag[2]).join('|');
                                }
                                // odd to assign such a list, but is for backwards compat.
                                entities[tag[1]] = [tag[1], tag[2], myarg.desc, !!myarg.private, !!myarg.publish];
                                if (ent_updated)
                                        ent_updated[tag[1]] = true;
                                return '';
                        case '!at':
                        case '!attlist':
                                tag = arg.match(/^\s*([a-z_][a-z_0-9]*)\s+(.*)$/i);
                                if ((!tag) || !(tag[1] in tags)) // unparsable or unknown element
                                         return '';
                                arg = tag[2];
                                tag = tag[1];
                                if (!(tags[tag] & 8))
                                        return ''; // do not allow to modify system tags
                                if (arg.match(/^['"]/))
                                        arg = arg.slice(1,-1);
                                elements[tag][2] = scanattlist(arg);
                                return '';
                        case '!el':
                        case '!element': {
                                var definition = '';

                                tag = arg.match(/^\s*([a-z_][a-z_0-9]*)(.*)$/i);
                                if (!tag)
                                        return '';
                                arg = tag[2];
                                tag = tag[1];
                                if ((tag in tags) && !(tags[tag] & 8))
                                        return ''; // do not allow to modify system tags
                                // do we have a definition?
                                if (!arg.match(/^\s*(att=|tag=|flag=|open(\s|$)|delete(\s|$)|empty(\s|$))/i)) {
                                        // yes, chop off
                                        myarg = arg.match(/\s*([^'"\s]\S*|'[^']*'|"[^"]*")(.*)$/);
                                        definition = myarg[1];
                                        if (definition.match(/^['"]/))
                                                definition = definition.slice(1,-1);
                                        arg = myarg[2];
                                }
                                // now scan attributes:
                                myarg = scanargs(arg, ['att', 'flag', 'open', 'delete', 'empty'], {});
                                if (myarg.delete) {
                                        delete elements[tag];
                                        return '';
                                }
                                tags[tag] = 9 | (myarg.empty ? 2 : 0) | (myarg.open ? 0 : 4)
                                // odd to assign such a list, but is for backwards compat.
                                elements[tag] = [tag, definition, scanattlist(myarg.att), myarg.flag, !!myarg.open, !!myarg.empty];
                                if (el_updated)
                                        el_updated[tag] = true;
                                return '';
                        }
                        case 'frame': {

                                var css = null, expl_title = false;

                                myarg = scanargs(arg, ['name'], {});

                                if (!myarg.name || typeof myarg.name != 'string')
                                        return ''; // no name, no frame

				log('MXP.frame:', myarg);

                                if (typeof myarg.action == 'string') {
                                        switch (myarg.action.toLowerCase()) {
                                                case 'open':
                                                        myarg.open = true; break;
                                                case 'close':
                                                        myarg.close = true; break;
                                                case 'eof':
                                                        myarg.eof = true; break;
                                        }
                                }

                                if (!myarg.close && !myarg.eof)
                                        myarg.open = true;

				if (!myarg.close && !myarg.eof && j('.tab-' + myarg.name).length)
					myarg.eof = true;

                                if (typeof myarg.title != 'string')
                                        myarg.title = myarg.name;
                                else if (myarg.title.length)
                                        expl_title = true;
                                else
                                        myarg.title = myarg.name;

                                if (typeof myarg.parent != 'string' || !myarg.parent.length)
                                        delete myarg.parent;
                                if (typeof myarg.align != 'string')
                                        delete myarg.align;
                                else
                                        myarg.align = myarg.align.toLowerCase();

                                if (myarg.width || myarg.height || myarg.left || myarg.top || myarg.align) {
                                        var aligned = false, normalize_dim = function(dim) {
                                                if (!dim)
                                                        return null;
                                                return dim
                                                        .replace(/^([0-9.]+)c$/, '$1em')        // 1 c(har) = 1 em
                                                        .replace(/^([0-9.]+)$/, '$1px');        // default unit is PiXel
                                        }

                                        css = {
                                                width: normalize_dim(myarg.width),
                                                height: normalize_dim(myarg.height),
                                                left: normalize_dim(myarg.left),
                                                top: normalize_dim(myarg.top),
                                        };
                                        if (myarg.align) {
                                                // must allow combinations like bottom right
                                                if (myarg.align.has('top')) {css.top = 0; aligned = true;}
                                                if (myarg.align.has('bottom')) {css.bottom = 0; aligned = true;}
                                                if (myarg.align.has('left')) {css.left = 0; aligned = true;}
                                                if (myarg.align.has('right')) {css.right = 0; aligned = true;}
                                        }
                                        if (!css.width && !css.height && !css.left && !css.top && !aligned)
                                                css = null;
                                        else {
                                                // a heigth or width of zero is taken literally, we enter the default values from Windows.js
                                                if (!css.width)
                                                        css.width = '380px';
                                                if (!css.height)
                                                        css.height = '380px';
                                                css.pos = 1;
                                        }
                                }
                                // some special system names:
                                switch(myarg.name.toLowerCase()) {
                                        case '_parent':
                                        case '_previous':
                                                return ''; // ignore command
                                        case '_top':
                                                // we allow to redefine the title, and only that
                                                if (expl_title && Config.ScrollView && Config.ScrollView.title)
                                                        Config.ScrollView.title(myarg.title);
                                                return ''; // no other actions on main window..
                                }
                                if (window[myarg.name] || j('.' + myarg.name).length) {
                                        if (myarg.close)
                                                j('.' + myarg.name).remove();
                                        else if (myarg.eof) {
                                                // we erase contents only when explicitly asked to
                                                if (j('.' + myarg.name + ' .out').length) /* need a better way to empty different elements */
                                                        j('.' + myarg.name + ' .out').empty();
                                                else
                                                        j('.' + myarg.name + ' .content').empty();
                                        }
					else if (myarg.open) {
                                                if (Config[myarg.name]) {
                                                        // already open
                                                        if (expl_title)
                                                                Config[myarg.name].title(myarg.title);
                                                        if (css)
                                                                j('.' + myarg.name).css(css);
                                                } 
						else {
                                                        try {
                                                                Config[myarg.name] = new window[myarg.name];
                                                        } catch(ex) {
                                                                //console.log('New MXP window: ' + myarg.name);
                                                                Config[myarg.name] = new Window({
                                                                        id: '#' + myarg.name,
                                                                        title: myarg.title,
                                                                        'class': myarg.name + ' nofade',
                                                                        css: css
                                                                });

                                                                j('#' + myarg.name + ' .content').addClass('nice').niceScroll({
                                                                        cursorwidth: 7,
                                                                        cursorborder: 'none'
                                                                });
                                                        }
                                                }
                                        }
                                } 
				else if (myarg.parent && Config[myarg.parent]) {
                                        if (myarg.close) {
                                                j('.tab-' + myarg.name).remove();
                                                j('a[href="#tab-'+myarg.name+'"]').remove();
                                        } 
					else 
					if (myarg.eof) {
                                                // we erase contents only when explicitly asked to
                                                if (j('.tab-' + myarg.name + ' .content').length)
                                                        j('.tab-' + myarg.name + ' .content').empty();
                                                else
                                                        j('.tab-' + myarg.name).empty();
                                        } 
					else if (myarg.open && !j('.tab-' + myarg.name).length)
                                                Config[myarg.parent].win.tab({
                                                        name: myarg.name,
                                                        'class': 'tab-'+myarg.name,
                                                        scroll: 1
                                                });
                                } 
				else if (!myarg.parent && myarg.open) {
                                        //console.log('New MXP window: ' + myarg.name);

                                        Config[myarg.name] = new Window({
                                                id: '#' + myarg.name,
                                                title: myarg.title,
                                                'class': myarg.name + ' nofade',
                                                css: css
                                        });

                                        j('#' + myarg.name + ' .content').addClass('nice').niceScroll({
                                                cursorwidth: 7,
                                                cursorborder: 'none'
                                        });
                                }

                                Event.fire('mxp_frame', myarg.name, myarg.close ? 'close' : (myarg.eof ? 'eof' : 'open'));

                                return '';
                        }
                        case 'sound': {
                                var parts, fname;

                                if (!arg.length)
                                        return '';
                                if (parts = arg.match(/^([^ ]+) +(.*)$/)) {
                                        fname = parts[1];
                                        arg = parts[2];
                                } else {
                                        fname = arg;
                                        arg = ''
                                }
                                myarg = scanargs(arg, [, 'v', 'l', 'p', 't', 'u'],
                                        {'v':'100', 'l':'1', 'p':'50'});
                                if (!fname.length)
                                        return '';
                                if (fname.toLowerCase() == 'off') {
                                        if (sound.audio)
                                                sound.audio.pause();
                                        sound.audio = 0;
                                        sound.fname = 0;
                                        if (myarg.u) {
                                                sound.url = myarg.u.replace(/\/$/, '');
                                                if (!music.url)
                                                        music.url = sound.url;
                                        }
                                        return '';
                                }
                                if (!myarg.u)
                                        myarg.u = sound.url;
                                if (!myarg.u)
                                        return ''; // nowhere to download
                                if(isNaN(myarg.v = parseInt(myarg.v)))
                                        myarg.v = 100;
                                if(isNaN(myarg.l = parseInt(myarg.l)))
                                        myarg.l = 1;
                                if(isNaN(myarg.p = parseInt(myarg.p)))
                                        myarg.p = 50;
                                if (myarg.v < 0)
                                        return '';
                                if (myarg.v > 100)
                                        myarg.v = 100;
                                if (!sound.fname || myarg.p > sound.prio) {
                                        sound.prio = myarg.p;
                                        sound.fname = fname;
                                        if (sound.audio)
                                                sound.audio.pause();
                                        sound.audio = new Audio(myarg.u + '/' + fname);
                                        sound.audio.onended = soundended;
                                        sound.audio.volume = myarg.v / 100.0
                                        sound.loop = myarg.l;
                                        sound.audio.play();
                                }
                                return '';
                        }
                        case 'music': {
                                var parts, fname;

                                if (!arg.length)
                                        return '';
                                if (parts = arg.match(/^([^ ]+) +(.*)$/)) {
                                        fname = parts[1];
                                        arg = parts[2];
                                } else {
                                        fname = arg;
                                        arg = ''
                                }
                                myarg = scanargs(arg, [, 'v', 'l', 'c', 't', 'u'],
                                        {'v':'100', 'l':'1', 'c':'0'});
                                if (!fname.length)
                                        return '';
                                if (fname.toLowerCase() == 'off') {
                                        if (music.audio)
                                                music.audio.pause();
                                        music.audio = 0;
                                        music.fname = 0;
                                        if (myarg.u) {
                                                music.url = myarg.u.replace(/\/$/, '');
                                                if (!sound.url)
                                                        sound.url = music.url;
                                        }
                                        return '';
                                }
                                if (!myarg.u)
                                        myarg.u = music.url;
                                if (!myarg.u)
                                        return ''; // nowhere to download
                                if(isNaN(myarg.v = parseInt(myarg.v)))
                                        myarg.v = 100;
                                if(isNaN(myarg.l = parseInt(myarg.l)))
                                        myarg.l = 1;
                                if (myarg.v < 0)
                                        return '';
                                if (myarg.v > 100)
                                        myarg.v = 100;
                                if (fname == music.fname && myarg.c == '1') {
                                        // adjust volume, reset loop counter
                                        music.audio.volume = myarg.v / 100.0
                                        music.loop = myarg.l;
                                        return '';
                                }
                                music.fname = fname;
                                if (music.audio)
                                        music.audio.pause();
                                music.audio = new Audio(myarg.u + '/' + fname);
                                music.audio.onended = musicended;
                                music.audio.volume = myarg.v / 100.0
                                music.loop = myarg.l;
                                music.audio.play();
                                return '';
                        }
                        default:
                                return userelement(tag, arg, '');
                }
                return ''; // ignore unknown tag
        }

        var tagexec = function(tag, arg, text, dest_msgs) {
                var myarg;

                // replace a &text; tag in the arguments:
                arg = arg.replace(/&text;/g, stripANSI(text));
                // we use capital <SPAN> tags on purpose, Colourize uses lowercase and Scrollview deletes old lines based on those tags.
                switch(tag) {
                        case 'b':
                        case 'bold':
                        case 'strong':
                                return '\033<SPAN style="font-weight:500"\033>' + text + '\033</SPAN\033>';
                        case 'i':
                        case 'italic':
                        case 'em':
                                return '\033<SPAN style="font-style:italic"\033>' + text + '\033</SPAN\033>';
                        case 'u':
                        case 'underline':
                                return '\033<SPAN style="text-decoration:underline"\033>' + text + '\033</SPAN\033>';
                        case 's':
                        case 'strikeout':
                                return '\033<SPAN style="text-decoration:line-through"\033>' + text + '\033</SPAN\033>';
                        case 'h':
                        case 'high':
                                return '\033<SPAN style="filter:brightness(200%)"\033>' + text + '\033</SPAN\033>';
                        case 'c':
                        case 'color':
                                myarg = scanargs(arg, ['fore', 'back'], {'fore':'', 'back':''});
                                arg = '\033<SPAN style="';
                                if (myarg.fore)
                                        arg += 'color:' + myarg.fore + ';';
                                if (myarg.back)
                                        arg += 'display:inline-block;height=1;background-color:' + myarg.back + ';';
                                return arg + '"\033>' + text + '\033</SPAN\033>';
                        case 'font':
                                myarg = scanargs(arg, ['face', 'size', 'color', 'back'], {'face':'', 'size':'','color':'', 'back':''});
                                arg = '\033<SPAN style="';
                                if (myarg.face)
                                        arg += 'font-family:\'' + myarg.face.replace(/['"]/, '') + '\';';
                                if (myarg.size)
                                        arg += 'font-size:' + myarg.size + 'px;';
                                if (myarg.color)
                                        arg += 'color:' + myarg.color + ';';
                                if (myarg.back)
                                        arg += 'display:inline-block;height=1;background-color:' + myarg.back + ';';
                                return arg + '"\033>' + text + '\033</SPAN\033>';
                        case 'a':
                                myarg = scanargs(arg, ['href', 'hint', 'expire'], {'href':'', 'hint':'','expire':''});
                                arg = '\033<A target=_blank';
                                if (myarg.href)
                                        arg += ' href=' + wraparg(myarg.href, true);
                                if (myarg.hint)
                                        arg += ' title=' + wraparg(myarg.hint, true)
                                if (myarg.expire && (typeof myarg.expire == 'string'))
                                        arg += ' mxp_expire=' + wraparg(myarg.expire);
                                arg = arg + '\033>' + text + '\033</A\033>';
                                return arg;
                        case 'send':
                                myarg = scanargs(arg, ['href', 'hint', 'prompt', 'expire'], {'href':stripANSI(text), 'hint':'', 'prompt':false, 'expire':''});
                                arg = '\033<A  class="mxp tip" href=' + wraparg(myarg.href, true);
                                if (!myarg.hint)
                                        myarg.hint = myarg.href;
                                tag = myarg.hint.replace(/\|.*$/, '')
                                if (myarg.href.match(/\|/)) {
                                        if (!myarg.hint.match(/\|/) || myarg.hint.match(/\|/g).length <= myarg.href.match(/\|/g).length) {
                                                tag += " (right-click for more...)";
                                        }
                                }
                                arg += ' title=' + wraparg(tag, true) + ' mxp_hint=' + wraparg(myarg.hint, true);
                                if (myarg['prompt'])
                                        arg += ' mxp_prompt="true"';
                                if (myarg.expire && (typeof myarg.expire == 'string'))
                                        arg += ' mxp_expire=' + wraparg(myarg.expire);
                                arg = arg + '\033>' + text + '\033</A\033>';
                                return arg;
                        case 'dest': {
                                var css = null, expl_title = false;

                                myarg = scanargs(arg, ['name'], {});
                                if (!myarg.name || typeof myarg.name != 'string' || !myarg.name.match(/^[a-z][\-a-z0-9_]*$/i))
                                        return text; // no name, no frame
                                text = prep(
                                        text
                                        .replace(/\n/g,'<br>')
                                        .replace(/\x1b\[[1-7]z<dest ([^>]+)/gi, '<div class="dest" name="$1"')
                                        .replace(/\x1b\[[1-7]z<\/dest>/gi, '</div>')
                                );
                                if (typeof myarg.x != 'string' || !myarg.x.length)
                                        delete myarg.x;
                                if (typeof myarg.y != 'string' || !myarg.y.length)
                                        delete myarg.y;

                                if (myarg.x || myarg.y)
                                        text = '<span style="position: absolute; top: ' + (myarg.y || 0) + '; left: ' + (myarg.x || 0) + '">' + text + '</span>';

                                text = Event.fire('mxp_dest', text, myarg.name);

                                if (j('.tab-'+myarg.name).length) {
                                        dest_msgs.push({name: myarg.name,
                                                ob:j('.tab-'+myarg.name + ' .content').length ?
                                                        '.tab-'+myarg.name + ' .content' :
                                                        '.tab-'+myarg.name,
                                                text:text
                                        });
                                } else if (j('#' + myarg.name).length) {
                                        if (myarg.name == 'scroll-view') {
                                                dest_msgs.push({name: myarg.name, text:text});
                                        } else {
                                                dest_msgs.push({name: myarg.name, ob:'#' + myarg.name + ' .content', text:text});
                                        }
                                } else if (myarg.name == 'modal') {
                                        dest_msgs.push({name: myarg.name, text:text});
                                } else {
                                        // unknown frame:
                                        return text;
                                }
                                return ''; // all done through window
                        }
                        default:
                                return userelement(tag, arg, text);
                }
        }

        var replace_ent = function(t, args) {
                return t.replace(/&([A-Z_][A-Z_0-9]*);/gi, function(m, p1, offset, string) {
                        if (args && args.hasOwnProperty(p1)) {
                                return args[p1];
                        } else if (entities.hasOwnProperty(p1)) {
                                return entities[p1][1];
                        } else {
                                return m;
                        }
                });
        }

        var scantags = function(t, endtag, defmode, curmode) {
                var res = '', m, str, tfl, tempsec, ent_updated = {}, el_updated = {};
                var copy_ent, copy_el, lastmode = -10, dest_msgs = [];

                function stat(f) {
                        return { text:t, result:res, found:f, defmode:defmode, curmode:curmode, lastmode:lastmode, ent_updated:ent_updated,
                                el_updated:el_updated, dest_msgs:dest_msgs };
                }

                // It seems the only sensible way is to loop over all interesting elements
                while (m = t.match(/\033\[[0123567]z|\n|\033<|\033>|<|\033\[4z<?|&[A-Za-z_][A-Za-z_0-9]*;/)) {
                        tempsec = false;

                        switch(m[0]) {
                                case '\n':
                                        curmode = defmode;
                                        // need to close all open OPEN tags..
                                        // are we waiting for a tag to close? Read: is there an open tag?
                                        if (endtag) {
                                                // is this an open OPEN tag?
                                                if (!(tags[endtag.slice(1)] & 4)) {
                                                        // yep, return close found but leave buffer s.t. upper layer also runs into \n
                                                        res += t.substring(0, m.index);
                                                        t = t.substr(m.index);
                                                        return stat(true);
                                                }
                                        }
                                        // pass and step over \n
                                        res += t.substring(0, m.index + 1);
                                        t = t.substr(m.index + 1);
                                        break;
                                case '\033<':
                                case '\033>':
                                        res += t.substring(0, m.index + 2);
                                        t = t.substr(m.index + 2);
                                        break;
                                case '\033[4z<':
                                        tempsec = true;
                                case '<':
                                        res += t.substring(0, m.index);
                                        t = t.substr(m.index);
                                        // do we already have a first char of a name:
                                        if (!t.match(/^(?:\033\[4z)?<[!\/]?./)) {
                                                // need more chars to scan
                                                return stat(false);
                                        }
                                        // has this a chance to ever become a valid tag?
                                        if (!t.match(/^(?:\033\[4z)?<[!\/]?[A-Z_]/i)) {
                                                // no, pass < through, ignore a temp secmode prefix:
                                                t = t.substr(m[0].length);
                                                res += "&lt;";
                                                continue;
                                        }
                                        m = t.match(/^(?:\033\[4z)?<([!\/]?[A-Z_]\w*)\s*((?:[^"'>]|"[^"]*"|'[^']*')*)>/i)
                                        if (!m) { // incomplete tag, push back
                                                // but bail out , if we are resetting!!!
                                                if (in_forced_reset) {
                                                        t = ''; // drop all remaining input
                                                }
                                                return stat(false);
                                        }
                                        if (m[1][0] == '/') { // closing tag?
                                                t = t.substr(m[0].length);
                                                if (!tags[m[1].substr(1)]) // system tag in wrong capitalization?
                                                        m[1] = m[1].toLowerCase();
                                                if (m[1] == endtag) { // the one we are looking for?
                                                        // great, ignore all args, finish scan;
                                                        return stat(true);
                                                }
                                                // silently ignore it:
                                                continue;
                                        }
                                        tfl = tags[m[1]];
                                        if (!tfl) { // system tag in wrong capitalization?
                                                m[1] = m[1].toLowerCase();
                                                tfl = tags[m[1]];
                                        }
                                        if (!tempsec) {
                                                switch(curmode) {
                                                        case 0:
                                                                if (tfl & 4)
                                                                        tfl = 0; // ignore secure tag
                                                                break;
                                                        case 2:
                                                                tfl = 0; // ignore all tags, lock mode
                                                }
                                        }
                                        if (tfl & 2) {
                                                t = t.substr(m[0].length);
                                                // exec tag m[0]
                                                //console.log("Execute(" + m[1] + "(" + m[2] + "))\n");
                                                res += emptytagexec(m[1],  m[1].match(/^!el/) ? m[2] : replace_ent(m[2]), ent_updated, el_updated);
                                        } else if (tfl & 1) {
                                                // make backups in case they are changed, but the MXP sentence did not
                                                // finish:
                                                copy_ent = Object.assign({}, entities);
                                                copy_el = Object.assign({}, elements);
                                                str = scantags(t.substr(m[0].length), "/" + m[1], defmode, curmode)
                                                if (!str.found) {
                                                        // tag not closed, push back waiting for more.
                                                        entities = copy_ent;
                                                        elements = copy_el;
                                                        return stat(false);
                                                }
                                                t = str.text;
                                                ent_updated = Object.assign(ent_updated, str.ent_updated);
                                                el_updated = Object.assign(el_updated, str.el_updated);
                                                defmode = str.defmode;
                                                curmode = str.curmode;
                                                lastmode = str.lastmode;
                                                dest_msgs = dest_msgs.concat(str.dest_msgs);
                                                // exec tag m[0]
                                                // console.log("Execute(" + m[1] + "(" + m[2] + "), " + str.result + ")\n");
                                                res += tagexec(m[1], replace_ent(m[2]), str.result, dest_msgs);
                                        } else {
                                                // silently ignore unknown tags
                                                t = t.substr(m[0].length);
                                                // except when in lockedmode:
                                                if (curmode == 2)
                                                        res += m[0]; // following code should replace it with &lt;
                                        }
                                        break;
                                case '\033[3z':
                                        if (in_forced_reset && lastmode < 0) {
                                                lastmode = defmode;
                                        }
                                        curmode = defmode = 0;
                                        res += t.substring(0, m.index);
                                        // are we waiting for a tag to close? Read: is there an open tag?
                                        if (endtag) {
                                                // yep, return close found but leave buffer s.t. upper layer also runs into \e[3z
                                                t = t.substr(m.index);
                                                return stat(true);
                                        }
                                        // all tags closed, step over esc seq
                                        t = t.substr(m.index + 4);
                                        // reset all tags...
                                        break;
                                case '\033[4z':
                                        // if we see this, not followed by <, is there another char:
                                        res += t.substring(0, m.index);
                                        if (t.length > m.index + 4) { // yes, ignore;
                                                t = t.substr(m.index + 4);
                                        } else { // no, wait for more
                                                t = t.substr(m.index);
                                                return stat(false);
                                        }
                                        break;
                                default:
                                        res += t.substring(0, m.index);
                                        // entity?
                                        if (m[0].charAt(0) == '&') {
                                                t = t.substr(m.index + m[0].length);
                                                tfl = m[0].slice(1, -1);
                                                if (entities[tfl])
                                                        res += entities[tfl][1];
                                                else
                                                        res += m[0];
                                                continue;
                                        }
                                        // remaining \033\[0-7]z
                                        curmode = t.charCodeAt(m.index + 2) - 48;
                                        t = t.substr(m.index + 4);
                                        if (curmode >= 5)
                                                curmode = defmode = curmode - 5;
                                        //console.log("setmodeESC " + curmode + ", " + defmode + "\n");
                        }
                }
                // console.log("setmode " + curmode + ", " + defmode + "\n");
                res += t;
                t = '';
                return stat(false);
        }

        var process = function(t) {
                if (buffer) {
                        t = buffer + t;
                        buffer = '';
                }

                if (!t)
                        return t;

                // check for partial esc seq or < at the end and chop it to buffer:
                t = t.replace(/\033[[0-7]{0,2}$|\xff[\x5b\xfa\xfb\xff]{0,3}$|^<$|[^\033]<$/, function(seq, c, off, str) {
                                buffer = seq;
                                return '';
                        }
                );

                // Freshman: what the heck is this? MXP is not a telnet sub neg
                if (t.has('\xff\xfa\x5b\xff\xf0')) {
                        log('Got IAC SB MXP IAC SE -> BEGIN MXP');
                        t = t.replace(/\xff\xfa\x5b\xff\xf0/, '');
                        mxp = 1;
                }

                if (t.has('\xff\xfb\x5b')) {
                        // console.log('Got IAC WILL MXP -> BEGIN MXP');
                        t = t.replace(/\xff\xfb\x5b/, '');
                        mxp = 1;
                }

                if (!mxp)
                        return t;

                t = t.replace(/\r/g,'');

                t = scantags(t, undefined, defmode, curmode);
                buffer = t.text + buffer;
                if (in_forced_reset && (t.lastmode >= 0)) {
                        log("MXP mode reset to " + t.lastmode);
                        defmode = curmode = t.lastmode;
                } else {
                        defmode = t.defmode;
                        curmode = t.curmode;
                }
                in_forced_reset = false;
                for (var destmsg of t.dest_msgs) {
                        destmsg.text = Event.fire('mxp_dest', destmsg.text, destmsg.name);
                        switch(destmsg.name) {
                                case 'modal': {
                                        var text = destmsg.text.split('<br>');
                                        var title = text.shift();

                                        text.shift();
                                        new Modal({
                                                title: title,
                                                text: text.join('<br>'),
                                                replace: 1
                                        });
                                        break;
                                }
                                case 'scroll-view':
                                        Config.ScrollView.add(destmsg.text);
                                        j('#scroll-view').get(0).win.front();
                                        break;
                                default: {
                                        var my = j(destmsg.ob);

                                        my.append(destmsg.text);
                                        if (my.hasClass('nice')) {
                                                my.getNiceScroll().resize();
                                                my.scrollTop(my.prop('scrollHeight'));
                                        }
                                }
                        }
                }
                for (var key in t.ent_updated) {
                        if (t.ent_updated.hasOwnProperty(key) && entities[key]) {
                                Event.fire('mxp_entity', entities[key]);
                        }
                }
                for (var key in t.el_updated) {
                        var desc;

                        if (t.el_updated.hasOwnProperty(key) && (desc = elements[key])) {
                                desc = [desc[0], desc[3] ? 'FLAG="' + desc[3] + '"' : 'FLAG=""', /(?=a)b/, desc[1], desc[2],  desc[4], desc[5],];
                                Event.fire('mxp_elements', [desc]);
                        }
                }
                // check if any secure MXP line is embedded.. it must got to
                // the client instead.. we do this here, as the VERSION or
                // SUPPORT tag may be scanned multiple time when parsing
                // nested stacks of tags in several tries.
                t = t.result.replace(/\033\[1z<(?:[^"'>]|"[^"]*"|'[^']*')*>\n/, function(match, offset, string) {
                        // there is a sendMXP function for an unknown reason and
                        // it does not work (for me)
                        Config.socket.send(match);
                        return '';
                });
                return t;
        };

        var multi = function(o, src) {

                var o = o.split('|'), hint = [], mxp_prompt = '', firststyle=' style="font-weight:500"';

                log(o);

                if (j(src).attr('mxp_hint') && j(src).attr('mxp_hint').has('|'))
                        hint = j(src).attr('mxp_hint').split('|');
                if (hint.length > o.length)
                        hint.shift();

                if (j(src).attr('mxp_prompt'))
                        mxp_prompt = ' mxp_prompt="true"';

                j('.mxp-dropdown').remove();

                j('body').append('<ul class="mxp-dropdown"></ul>');

                for (var i = 0; i < o.length; i++, firststyle = '')
                        j('.mxp-dropdown').append('<li><a class="mxp" href="'+o[i]+'"' + mxp_prompt + firststyle + '>' + (hint[i] || o[i]) + '</a>');

                j('.mxp-dropdown').css({
                        top: j(src).offset().top,
                        left: j(src).offset().left + j(src).width() + 5,
                        position: 'absolute'
                });

                j('input').on('mouseover', function() {
                        j('.mxp-dropdown').remove();
                });
        };

        var translate = function(t) {
                return prep(process(t));
        };

        j('body').on('click', '.mxp', function(evt) {

                j('.mxp-dropdown').remove();

                var href = j(this).attr('href');

                if (href) {
                        href = href.replace(/\|.*$/, ''); // exec default command
                        if (href == '#')
                                href = '';
                }
                else
                        href == j(this).text(); // should not happen, scanner always sets href

                if (j(this).attr('mxp_prompt')) {
                        j('.send').val('').focus().val(href); // this odd trick ensures href is not selected, though focus selects text
                } else
                        Config.socket.send(href);

                return false;
        });

        j('body').on('touchend contextmenu', '.mxp', function(evt) {

                j('.mxp-dropdown').remove();

                var href = j(this).attr('href');

                if (href) {
                        if (href.has('|')) { // right click opens menu selection
                                multi(href, this);
                                return false; // else ignore
                        }
                        // else exec default command, helpful in menus
                        if (href == '#')
                                href = '';
                }
                if (j(this).attr('mxp_prompt')) {
                        j('.send').val('').focus().val(href); // this odd trick ensures href is not selected, though focus selects text
                } else
                        Config.socket.send(href);
                return false;
        });

        j('body').on('click', function(evt) {
                if (!j(this).is('a'))
                        j('.mxp-dropdown').remove();
        });

        return {
                prep: prep,
                process: process,
                translate: translate,
                enabled: function() {
                        return mxp;
                },
                disable: function() {
                        mxp = 0;
                },
                print2forcereset: function() {
                        in_forced_reset = true;
                        return "\033[3z";
                },
                idle: function() { return !buffer.length; },
        };
};

if (Config.getSetting('mxp') == null || Config.getSetting('mxp') == 1) {
        Config.mxp = new MXP();
        Event.listen('internal_mxp', Config.mxp.process);
}
else
        log('MXP disabled in profile or game preferences.');


