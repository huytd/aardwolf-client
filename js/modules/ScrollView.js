/*
 * Scrollview from www.mudportal.com, slighty adopted to Freshman's MXP module
 * Version 2.0a    10/3/2020
 *
 * 2.0  - version compatible to MXP module
 * 2.0a - working telnet echo off, input not put in history; <>& chars handling improved in input and text protocol
 *        Special html chars handling improved for Browser Title
 */


var ScrollView = function (o) {

        var self = this, ws = {}, sesslog = '', freeze, mobile = Config.device.mobile, touch = Config.device.touch, multi;
        var cmds = [], cmdi = 0, echo = 1;
        var keepcom = (Config.getSetting('keepcom') == null || Config.getSetting('keepcom') == 1);

        var o = o || {
                css: {
                        width: Config.width,
                        height: Config.height,
                        top: Config.top,
                        left: Config.left
                },
                local: 1, /* local echo */
                scrollback: 15 * 1000
        };

        if (Config.kong)
                o.css.height = j(window).height() - 3;

        var id = '#scroll-view';

        o.local = (Config.getSetting('echo') == null || Config.getSetting('echo') == 1);
        o.echo = o.echo || 1;

        var win = new Window({
                id: id,
                css: o.css,
                'class': 'scroll-view nofade',
                master: !Config.notrack,
        });

        if (mobile) {

                j('#page').css({
                        background: 'none no-repeat fixed 0 0 #000000',
                        margin: '0px auto'
                });

                j('body').css({
                        width: '100%',
                        height: '100%',
                        overflow: 'auto'
                });

                win.maximize();
        }

        if (touch)
                j(id).css({ top: 0, left: 0 });

        win.button({
                title: 'Reconnect.',
                icon: 'icon-refresh',
                click: function () {
                        echo('Attempting to reconnect...');
                        Config.socket.reconnect();
                }
        });

        win.button({
                title: 'Increase font size.',
                icon: 'icon-zoom-in',
                click: function (e) {
                        var v = parseInt(j(id + ' .out').css('fontSize'));
                        j(id + ' .out').css({
                                fontSize: ++v + 'px',
                                lineHeight: (v + 5) + 'px'
                        });
                        j(id + ' .out').scrollTop(j(id + ' .out').prop('scrollHeight'));
                        e.stopPropagation();
                        return false;
                }
        });

        win.button({
                title: 'Decrease font size.',
                icon: 'icon-zoom-out',
                click: function (e) {
                        var v = parseInt(j(id + ' .out').css('fontSize'));
                        j(id + ' .out').css({
                                fontSize: --v + 'px',
                                lineHeight: (v + 5) + 'px'
                        });
                        j(id + ' .out').scrollTop(j(id + ' .out').prop('scrollHeight'));
                        e.stopPropagation();
                        return false;
                }
        });

        win.button({
                title: 'Download session log.',
                icon: 'icon-download-alt',
                click: function (e) {
                        var blob = new Blob(sesslog.split(), { type: "text/plain;charset=utf-8" });
                        saveAs(blob, "log-" + Config.host + "-" + (new Date).ymd() + ".txt");
                        e.stopPropagation();
                        return false;
                }
        });

        //if (Config.dev)
        win.button({
                title: 'Toggle Side Panel.',
                icon: 'icon-columns',
                click: function (e) {
                        if (j(id + ' .freeze').length) {
                                try {
                                        freeze.remove();
                                        j(id + ' .freeze').remove();
                                        j(id + ' .out').width('98%');
                                        j(id + ' .out').scrollTop(j(id + ' .out').prop('scrollHeight'));
                                } catch (ex) { log(ex) }
                        }
                        else {
                                j(id + ' .out').after('<div class="freeze">' + j(id + ' .out').html() + '</div>');
                                j(id + ' .out').width('52%');
                                freeze = j(id + ' .freeze').niceScroll({
                                        cursorwidth: 7,
                                        cursorborder: 'none'
                                });
                                j(id + ' .freeze').scrollTop(j(id + ' .freeze').prop('scrollHeight'));
                                j(id + ' .out').scrollTop(j(id + ' .out').prop('scrollHeight'));
                        }
                        e.stopPropagation();
                        return false;
                }
        });

        var mapWindow;
        var mapBuffer = '';
        var initMapWindow = function () {
                var mainWin = j(id);
                var mainOffset = mainWin.offset();
                var mainWidth = mainWin.width();
                var mainHeight = mainWin.height();

                mapWindow = new Window({
                        id: '#map-window',
                        title: 'Map',
                        'class': 'nofade',
                        css: {
                                width: 300,
                                height: 500,
                                left: (mainOffset.left + mainWidth + 10),
                                top: mainOffset.top
                        },
                        closeable: true,
                        onClose: function () {
                                Config.showMapWindow = false;
                        }
                });

                j('#map-window .content').css({
                        'background-color': '#000',
                        'overflow': 'auto',
                        'opacity': 1
                });

                j('#map-window .content').append('<div class="map-content" style="padding: 5px; color: white; font-family: monospace; font-size: 10px; line-height: 7px;"></div>');

                j('#map-window .map-content').niceScroll({
                        cursorwidth: 7,
                        cursorborder: 'none'
                });

                Config.showMapWindow = true;
        };

        // Initialize map window after a short delay to ensure main window is positioned
        setTimeout(function () {
                initMapWindow();
                log('Map window initialized');
        }, 500);

        var colorizer = new Colorize();
        var updateMapContent = function (content) {
                log('updateMapContent called with content length: ' + content.length);
                if (mapWindow && j('#map-window').length) {
                        var colorized = colorizer.process(content);
                        j('#map-window .map-content').html('<div style="margin: 0; padding: 5px; font-family: \'DejaVu Sans Mono\', monospace; white-space: pre-wrap; word-break: keep-all; line-height: 7px; color: #e1e1e1;">' + colorized + '</div>');
                        var nicescroll = j('#map-window .map-content').getNiceScroll();
                        if (nicescroll.length) {
                                nicescroll[0].resize();
                        }
                        log('Map window updated successfully');
                } else {
                        log('Map window not found');
                }
        };

        var processMapBuffer = function () {
                var fullText = mapBuffer;
                mapBuffer = '';

                var mapMatch = fullText.match(/<MAPSTART>(.*?)<MAPEND>/);
                if (mapMatch && mapMatch[1]) {
                        updateMapContent(mapMatch[1]);
                } else {
                        mapBuffer = fullText;
                }
        };

        // Listen to multiple events to catch map content
        ['after_protocols', 'before_html', 'before_display'].forEach(function (eventName) {
                Event.listen(eventName, function (m) {
                        try {
                                // Extract map content when both tags are present
                                if (m.indexOf('<MAPSTART>') !== -1 && m.indexOf('<MAPEND>') !== -1) {
                                        var mapMatch = m.match(/<MAPSTART>(.*?)<MAPEND>/s);
                                        if (mapMatch && mapMatch[1]) {
                                                updateMapContent(mapMatch[1]);
                                        }
                                }
                        } catch (ex) { log('ScrollView map display error: ', ex); }
                        return m;
                });
        });

        j(id + ' .content').append('\
                <div class="out nice"></div>\
                <div class="input">\
                        <input class="send" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="'+ (Config.getSetting('spellcheck') ? 'true' : 'false') + '" placeholder="Enter a command..." aria-live="polite"/></div>\
        ');

        if (mobile) {
                j(id + ' .out').css({
                        'font-family': 'DejaVu Sans Mono',
                        'font-size': '11px',
                        height: '90%'
                });
        }
        else {

                j(id + ' .input').append('<a class="kbutton multiline tip" title="Enter mulit-line text." style="height: 16px !important; padding: 4px 8px !important; margin-left: 6px; position: relative; top: 3px;"><i class="icon-align-justify"></i></a>');

                multi = function (e, text) {

                        var modal = new Modal({

                                title: 'Multi-Line Input',
                                text: '<textarea class="multitext" autocorrect="off" autocapitalize="off" spellcheck="' + (Config.getSetting('spellcheck') ? 'true' : 'false') + '">' + (text || '') + '</textarea>',
                                closeable: 1,
                                buttons: [
                                        {
                                                text: 'Send',
                                                click: function () {
                                                        var msg = j('.multitext').val().split('\n');
                                                        var ws = Config.Socket.getSocket();
                                                        for (var i = 0; i < msg.length; i++) {
                                                                var go = function (msg) {
                                                                        return function () {
                                                                                ws.send(msg + '\r\n');
                                                                                echo(msg);
                                                                                //cmds.push(msg);
                                                                                //cmdi = cmds.length;
                                                                        }
                                                                }(msg[i]);
                                                                setTimeout(go, 100 * (i + 1));
                                                        }
                                                }
                                        },
                                        {
                                                text: 'Cancel'
                                        }
                                ]
                        });

                        j('#modal').on('shown', function () {
                                j('.multitext').focus();
                                //j('#modal').resizable();
                        });

                        if (e)
                                e.stopPropagation();
                        return false;
                }

                j(id).on('click', '.multiline', multi);

                if (!Config.embed && !Config.kong)
                        j(id + ' .send').autocomplete({
                                appendTo: "body",
                                minLength: 2,
                                source: function (request, response) {
                                        var c = cmds.filter(function (v, i, a) { return a.indexOf(v) == i });
                                        var results = j.ui.autocomplete.filter(c, request.term);
                                        response(results.slice(0, 5));
                                }
                        });
        }

        j(id + ' .out').niceScroll({
                cursorwidth: 7,
                cursorborder: 'none',
                railoffset: { top: -2, left: -2 }
        });

        /*
        j(id).on('mouseup', '.out, .freeze', function() {
                var t;
                if ((t = getSelText())) {

                        if (t.match(/\n/) && Config.getSetting('automulti'))
                                multi(null, t);
                        else
                                j(id + ' .send').val(j(id + ' .send').val()+t);
                }
        });

        if (!Config.device.touch)
                j(id).on('mouseup', '.out, .freeze', function() {
                        if (!j(':focus').is('input, textarea'))
                                j(id + ' .send').focus();
                });
        */

        var scroll = function () { j(id + ' .out').scrollTop(j(id + ' .out').prop('scrollHeight')) };

        if (Config.device.mobile) {

                j(id + ' .send').focus(function () {
                        //this.setSelectionRange(0, 9999);
                        //j(this).val('');
                        j(id).height('82%');
                        scroll();
                });

                j(id + ' .send').blur(function () {
                        /*if (j(this).val().length) {
                                ws.send(j(this).val());
                                j(this).val('');
                        }
                        else ws.send('\r\n');*/
                        win.maximize();
                        scroll();
                });

                document.addEventListener('touchstart', function (e) {
                        scroll();
                        //var touch = e.touches[0];
                        //alert(touch.pageX + " - " + touch.pageY);
                }, false);

                j(id + ' .send').keydown(function (e) {

                        if (e.which == 13) { /* enter */

                                e.preventDefault();

                                if (j(this).val().length) {
                                        ws.send(j(this).val());
                                        j(this).val('');
                                }
                                else ws.send('\r\n');
                        }
                });

                j(id + ' .send').focus();
                setInterval(scroll, 2000);
        }
        else {

                j(id + ' .send').focus(function () {

                        if (!j(this).is(":focus"))
                                j(this).select();
                });

                j(id + ' .send').focus().keydown(function (e) {

                        if (e.which == 13) { /* enter */

                                e.preventDefault();

                                if (j(this).val().length) {
                                        var v = j(this).val();
                                        ws.send(v);
                                        if (o.echo) {
                                                cmds.push(v);
                                                cmdi++;
                                                //this.setSelectionRange(0, 9999);
                                                if (keepcom)
                                                        this.select();
                                                else
                                                        j(this).val('');
                                        } else {
                                                j(this).val('');
                                        }
                                }
                                else ws.send('\r\n');

                        }
                        else if (e.keyCode == 38) { /* arrow up */

                                e.preventDefault();

                                if (cmdi)
                                        j(this).val(cmds[--cmdi]);

                                this.select();
                                //this.setSelectionRange(0, 9999);
                        }
                        else if (e.keyCode == 40) { /* arrow down */

                                e.preventDefault();

                                if (cmdi < cmds.length - 1)
                                        j(this).val(cmds[++cmdi]);

                                this.select();
                                //this.setSelectionRange(0, 9999);
                        }
                });
        }

        Event.listen('internal_colorize', new Colorize().process);

        Event.listen('after_display', function (m) {
                try {
                        sesslog += m.replace(/<br>/gi, '\n').replace(/<.+?>/gm, '').replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&');
                } catch (ex) { log('ScrollView.after_display ', ex); }
                return m;
        });

        var add = function (A) {

                var my = j(id + ' .out');

                if (my[0].scrollHeight > o.scrollback) {

                        j(id + ' .out').contents().slice(0, 100).remove();

                        var t = j(id + ' .out').html(), i = t.indexOf('<span');

                        j(id + ' .out').html(t.slice(i));
                }
                // console.log('add("' + A + '")\n');
                my.append('<span>' + A + '</span>');
                scroll();

                if (j(id + ' .freeze').length)
                        j(id + ' .freeze').append('<span>' + A + '</span>');

                Event.fire('scrollview_add', A, self);
        }

        var scroll = function () {
                j(id + ' .out').scrollTop(j(id + ' .out').prop('scrollHeight'));
        }

        var echo = function (msg) {

                // we also echo empty lines after Enter!!
                //if (!msg.length)
                //      return;

                Event.fire('after_display', msg + '\n');

                if (o.local && o.echo) {

                        msg = msg.replace(/&/g, '&amp;');
                        msg = msg.replace(/\>/g, '&gt;');
                        msg = msg.replace(/\</g, '&lt;');

                        // add() above already surrounds with span.
                        add('</span><span style="font-size: 12px; color: gold; opacity: 0.6">' + msg + '<br>');
                }
        }

        var title = function (t) {
                win.title(t);
                document.title = t.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&') || param('name');
        }

        title(Config.name || (Config.host + ':' + Config.port));

        var echoOff = function () {
                o.echo = 0;
                j('.send').css({ 'color': j('.send').css('background-color') });
        }

        var echoOn = function () {
                o.echo = 1;
                j('.send').css({ 'color': '' });
        }

        var self = {
                add: add,
                echo: echo,
                echoOff: echoOff,
                echoOn: echoOn,
                title: title,
                id: id,
                scroll: scroll,
                win: win
        }

        var ws = new Socket({
                host: Config.host,
                port: Config.port,
                ttype: Config.ttype,
                proxy: Config.proxy,
                out: self
        });

        j(document).on('keydown', function (e) {

                if (j(':focus').is('input'))
                        return true;

                if (j(':focus').hasClass('out'))
                        return true;

                var k = e.keyCode;

                if (k == 36)
                        ws.send('northwest');

                if (k == 38)
                        ws.send('north');

                if (k == 33)
                        ws.send('northeast');

                if (k == 37)
                        ws.send('west');

                if (k == 39)
                        ws.send('east');

                if (k == 35)
                        ws.send('southwest');

                if (k == 40)
                        ws.send('south');

                if (k == 34)
                        ws.send('southeast');

                if (k == 109) {
                        ws.send('up');
                        return false;
                }

                if (k == 107) {
                        ws.send('down');
                        return false;
                }

                if (k == 12)
                        ws.send('enter');

                return true;
        });

        Config.ScrollView = self;
        Event.fire('scrollview_ready', null, self);

        return self;
}


