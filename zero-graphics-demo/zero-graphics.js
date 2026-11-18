const utf8decoder = new TextDecoder()
const utf8encoder = new TextEncoder()

function getString(getInstance, offset, length) {
    return utf8decoder.decode(new Uint8Array(getInstance().HEAPU8.buffer, offset, length))
}

function getU32Array(getInstance, offset, length) {
    return new Uint32Array(getInstance().HEAPU8.buffer, offset, length)
}

function createPlatformEnvironment(getInstance) {
    let log_string = ''
    return {
        wasm_quit() {
            getInstance().zeroGraphics.stopped = true
        },
        wasm_panic: (ptr, len) => {
            let msg = getString(getInstance, ptr, len)
            throw Error(msg)
        },
        wasm_log_write: (ptr, len) => {
            log_string += getString(getInstance, ptr, len)
        },
        wasm_log_flush: () => {
            console.log(log_string)
            log_string = ''
        },

        now_f64() {
            return Date.now()
        },
    }
}

function createWebsocketModule(getInstance) {
    const getMemory = () => ({buffer: getInstance().HEAPU8.buffer})

    let context = {
        next_id: 1,
        instances: {},
    }

    return {
        create(server_ptr, server_len, protocols_str_ptr, protocols_len_ptr, protocols_len) {
            let server = getString(getInstance, server_ptr, server_len)
            let protocols_ptr_arr = getU32Array(getInstance, protocols_str_ptr, protocols_len)
            let protocols_len_arr = getU32Array(getInstance, protocols_len_ptr, protocols_len)
            let protocols = []
            protocols.length = protocols_ptr_arr.length;
            for (const i in protocols_ptr_arr) {
                protocols[i] = getString(getInstance, protocols_ptr_arr[i], protocols_len_arr[i])
            }

            var ws = new WebSocket(server, protocols);

            var id = context.next_id;
            context.next_id += 1;
            context.instances[id] = ws;

            // app_ws_alloc(length: u32) ?[*]u8
            // app_ws_onmessage(handle: Handle, binary: bool, message_ptr: [*]u8, message_len: usize) void
            // app_ws_onopen(handle: Handle) void
            // app_ws_onerror(handle: Handle) void
            // app_ws_onclose(handle: Handle) void

            ws.onopen = function(event) {
                getInstance()._app_ws_onopen(id);
            };
            ws.onmessage = async function(event) {
                var binary;
                var array;
                if (typeof(event.data) == "string") {
                    binary = false;
                    array = utf8encoder.encode(event.data);
                } else {
                    binary = true;
                    array = new Uint8Array(await event.data.arrayBuffer());
                }

                if (context.instances[id] !== ws || getInstance().zeroGraphics.stopped) return;
                const api = getInstance();

                const ptr = api._app_ws_alloc(array.length);
                if (ptr == 0) {
                    console.error("out of memory when allocating", array.length, "bytes");
                    return;
                }

                const view = new Uint8Array(api.HEAPU8.buffer, ptr, array.length);
                view.set(array);

                api._app_ws_onmessage(id, binary, ptr, array.length);
            };
            ws.onclose = function(event) {
                getInstance()._app_ws_onclose(id);
            };
            ws.onerror = function(event) {
                getInstance()._app_ws_onerror(id);
            };

            return id
        },
        destroy(handle) {
            let instance = context.instances[handle];
            if (!instance) {
                return
            }
            instance.onopen = instance.onmessage = instance.onclose = instance.onerror = null
            instance.close()
            delete context.instances[handle]
        },
        send(handle, binary, message_ptr, message_len) {
            let instance = context.instances[handle];
            if (!instance) {
                throw 'invalid websocket handle ' + String(handle)
            }
            if (binary) {
                instance.send(new Uint8Array(getInstance().HEAPU8.buffer, message_ptr, message_len))
            } else {
                instance.send(getString(getInstance, message_ptr, message_len))
            }
        }
    }
}

const keyCodeToScancodeMap = {
    KeyA: 1, //  => SC.a,
    KeyB: 2, //  => SC.b,
    KeyC: 3, //  => SC.c,
    KeyD: 4, //  => SC.d,
    KeyE: 5, //  => SC.e,
    KeyF: 6, //  => SC.f,
    KeyG: 7, //  => SC.g,
    KeyH: 8, //  => SC.h,
    KeyI: 9, //  => SC.i,
    KeyJ: 10, //  => SC.j,
    KeyK: 11, //  => SC.k,
    KeyL: 12, //  => SC.l,
    KeyM: 13, //  => SC.m,
    KeyN: 14, //  => SC.n,
    KeyO: 15, //  => SC.o,
    KeyP: 16, //  => SC.p,
    KeyQ: 17, //  => SC.q,
    KeyR: 18, //  => SC.r,
    KeyS: 19, //  => SC.s,
    KeyT: 20, //  => SC.t,
    KeyU: 21, //  => SC.u,
    KeyV: 22, //  => SC.v,
    KeyW: 23, //  => SC.w,
    KeyX: 24, //  => SC.x,
    KeyY: 25, //  => SC.y,
    KeyZ: 26, //  => SC.z,
    Digit1: 27, //  => SC.@"1",
    Digit2: 28, //  => SC.@"2",
    Digit3: 29, //  => SC.@"3",
    Digit4: 30, //  => SC.@"4",
    Digit5: 31, //  => SC.@"5",
    Digit6: 32, //  => SC.@"6",
    Digit7: 33, //  => SC.@"7",
    Digit8: 34, //  => SC.@"8",
    Digit9: 35, //  => SC.@"9",
    Digit0: 36, //  => SC.@"0",
    Enter: 37, //  => SC.@"return",
    Escape: 38, //  => SC.escape,
    Backspace: 39, //  => SC.backspace,
    Tab: 40, //  => SC.tab,
    Space: 41, //  => SC.space,
    Minus: 42, //  => SC.minus,
    Equal: 43, //  => SC.equals,
    BracketLeft: 44, //  => SC.left_bracket,
    RightBracket: 45, //  => SC.right_bracket,
    Backslash: 46, //  => SC.backslash,
    Unknown: 47, //  => SC.nonushash,
    Semicolon: 48, //  => SC.semicolon,
    Unknown: 49, //  => SC.apostrophe,
    Unknown: 50, //  => SC.grave,
    Comma: 51, //  => SC.comma,
    Period: 52, //  => SC.period,
    Slash: 53, //  => SC.slash,
    CapsLock: 54, //  => SC.caps_lock,
    PrintScreen: 55, //  => SC.print_screen,
    Unknown: 56, //  => SC.scroll_lock,
    Unknown: 57, //  => SC.pause,
    Insert: 58, //  => SC.insert,
    Home: 59, //  => SC.home,
    PageUp: 60, //  => SC.page_up,
    Delete: 61, //  => SC.delete,
    End: 62, //  => SC.end,
    PageDown: 63, //  => SC.page_down,
    ArrowRight: 64, //  => SC.right,
    ArrowLeft: 65, //  => SC.left,
    ArrowDown: 66, //  => SC.down,
    ArrowUp: 67, //  => SC.up,
    NumLock: 68, //  => SC.num_lock_clear,
    NumpadDivide: 69, //  => SC.keypad_divide,
    NumpadMultiply: 70, //  => SC.keypad_multiply,
    NumpadSubtract: 71, //  => SC.keypad_minus,
    NumpadAdd: 72, //  => SC.keypad_plus,
    Unknown: 73, //  => SC.keypad_enter,
    Numpad1: 74, //  => SC.keypad_1,
    Numpad2: 75, //  => SC.keypad_2,
    Numpad3: 76, //  => SC.keypad_3,
    Numpad4: 77, //  => SC.keypad_4,
    Numpad5: 78, //  => SC.keypad_5,
    Numpad6: 79, //  => SC.keypad_6,
    Numpad7: 80, //  => SC.keypad_7,
    Numpad8: 81, //  => SC.keypad_8,
    Numpad9: 82, //  => SC.keypad_9,
    Numpad0: 83, //  => SC.keypad_0,
    Unknown: 84, //  => SC.keypad_00,
    Unknown: 85, //  => SC.keypad_000,
    Unknown: 86, //  => SC.keypad_period,
    NumpadDecimal: 87, //  => SC.keypad_comma,
    Unknown: 88, //  => SC.keypad_equalsas400,
    Unknown: 89, //  => SC.keypad_leftparen,
    Unknown: 90, //  => SC.keypad_rightparen,
    Unknown: 91, //  => SC.keypad_leftbrace,
    Unknown: 92, //  => SC.keypad_rightbrace,
    Unknown: 93, //  => SC.keypad_tab,
    Unknown: 94, //  => SC.keypad_backspace,
    Unknown: 95, //  => SC.keypad_a,
    Unknown: 96, //  => SC.keypad_b,
    Unknown: 97, //  => SC.keypad_c,
    Unknown: 98, //  => SC.keypad_d,
    Unknown: 99, //  => SC.keypad_e,
    Unknown: 100, //  => SC.keypad_f,
    Unknown: 101, //  => SC.keypad_xor,
    Unknown: 102, //  => SC.keypad_power,
    Unknown: 103, //  => SC.keypad_percent,
    Unknown: 104, //  => SC.keypad_less,
    Unknown: 105, //  => SC.keypad_greater,
    Unknown: 106, //  => SC.keypad_ampersand,
    Unknown: 107, //  => SC.keypad_dblampersand,
    Unknown: 108, //  => SC.keypad_verticalbar,
    Unknown: 109, //  => SC.keypad_dblverticalbar,
    Unknown: 110, //  => SC.keypad_colon,
    Unknown: 111, //  => SC.keypad_hash,
    Unknown: 112, //  => SC.keypad_space,
    Unknown: 113, //  => SC.keypad_at,
    Unknown: 114, //  => SC.keypad_exclam,
    Unknown: 115, //  => SC.keypad_memstore,
    Unknown: 116, //  => SC.keypad_memrecall,
    Unknown: 117, //  => SC.keypad_memclear,
    Unknown: 118, //  => SC.keypad_memadd,
    Unknown: 119, //  => SC.keypad_memsubtract,
    Unknown: 120, //  => SC.keypad_memmultiply,
    Unknown: 121, //  => SC.keypad_memdivide,
    Unknown: 122, //  => SC.keypad_plusminus,
    Unknown: 123, //  => SC.keypad_clear,
    Unknown: 124, //  => SC.keypad_clearentry,
    Unknown: 125, //  => SC.keypad_binary,
    Unknown: 126, //  => SC.keypad_octal,
    Unknown: 127, //  => SC.keypad_decimal,
    Unknown: 128, //  => SC.keypad_hexadecimal,
    Unknown: 129, //  => SC.keypad_equals,
    F1: 130, //  => SC.f1,
    F2: 131, //  => SC.f2,
    F3: 132, //  => SC.f3,
    F4: 133, //  => SC.f4,
    F5: 134, //  => SC.f5,
    F6: 135, //  => SC.f6,
    F7: 136, //  => SC.f7,
    F8: 137, //  => SC.f8,
    F9: 138, //  => SC.f9,
    F10: 139, //  => SC.f10,
    F11: 140, //  => SC.f11,
    F12: 141, //  => SC.f12,
    F13: 142, //  => SC.f13,
    F14: 143, //  => SC.f14,
    F15: 144, //  => SC.f15,
    F16: 145, //  => SC.f16,
    F17: 146, //  => SC.f17,
    F18: 147, //  => SC.f18,
    F19: 148, //  => SC.f19,
    F20: 149, //  => SC.f20,
    F21: 150, //  => SC.f21,
    F22: 151, //  => SC.f22,
    F23: 152, //  => SC.f23,
    F24: 153, //  => SC.f24,
    Unknown: 154, //  => SC.nonusbackslash,
    Unknown: 155, //  => SC.application,
    Unknown: 156, //  => SC.power,
    Unknown: 157, //  => SC.execute,
    Unknown: 158, //  => SC.help,
    Unknown: 159, //  => SC.menu,
    Unknown: 160, //  => SC.select,
    Unknown: 161, //  => SC.stop,
    Unknown: 162, //  => SC.again,
    Unknown: 163, //  => SC.undo,
    Unknown: 164, //  => SC.cut,
    Unknown: 165, //  => SC.copy,
    Unknown: 166, //  => SC.paste,
    Unknown: 167, //  => SC.find,
    Unknown: 168, //  => SC.mute,
    Unknown: 169, //  => SC.volumeup,
    Unknown: 170, //  => SC.volumedown,
    Unknown: 171, //  => SC.alterase,
    Unknown: 172, //  => SC.sysreq,
    Unknown: 173, //  => SC.cancel,
    Unknown: 174, //  => SC.clear,
    Unknown: 175, //  => SC.prior,
    Unknown: 176, //  => SC.return2,
    Unknown: 177, //  => SC.separator,
    Unknown: 178, //  => SC.out,
    Unknown: 179, //  => SC.oper,
    Unknown: 180, //  => SC.clearagain,
    Unknown: 181, //  => SC.crsel,
    Unknown: 182, //  => SC.exsel,
    Unknown: 183, //  => SC.thousandsseparator,
    Unknown: 184, //  => SC.decimalseparator,
    Unknown: 185, //  => SC.currencyunit,
    Unknown: 186, //  => SC.currencysubunit,
    ControlLeft: 187, //  => SC.ctrl_left,
    ShiftLeft: 188, //  => SC.shift_left,
    AltLeft: 189, //  => SC.alt_left,
    MetaLeft: 190, //  => SC.gui_left,
    ControlRight: 191, //  => SC.ctrl_right,
    ShiftRight: 192, //  => SC.shift_right,
    AltRight: 193, //  => SC.alt_right,
    MetaRight: 194, //  => SC.gui_right,
    Unknown: 195, //  => SC.mode,
    Unknown: 196, //  => SC.audio_next,
    Unknown: 197, //  => SC.audio_prev,
    Unknown: 198, //  => SC.audio_stop,
    Unknown: 199, //  => SC.audio_play,
    Unknown: 200, //  => SC.audio_mute,
    Unknown: 201, //  => SC.audio_rewind,
    Unknown: 202, //  => SC.audio_fastforward,
    Unknown: 203, //  => SC.media_select,
    Unknown: 204, //  => SC.www,
    Unknown: 205, //  => SC.mail,
    Unknown: 206, //  => SC.calculator,
    Unknown: 207, //  => SC.computer,
    Unknown: 208, //  => SC.ac_search,
    Unknown: 209, //  => SC.ac_home,
    Unknown: 210, //  => SC.ac_back,
    Unknown: 211, //  => SC.ac_forward,
    Unknown: 212, //  => SC.ac_stop,
    Unknown: 213, //  => SC.ac_refresh,
    Unknown: 214, //  => SC.ac_bookmarks,
    Unknown: 215, //  => SC.brightness_down,
    Unknown: 216, //  => SC.brightness_up,
    Unknown: 217, //  => SC.displayswitch,
    Unknown: 218, //  => SC.kbdillumtoggle,
    Unknown: 219, //  => SC.kbdillumdown,
    Unknown: 220, //  => SC.kbdillumup,
    Unknown: 221, //  => SC.eject,
    Unknown: 222, //  => SC.sleep,
    Unknown: 223, //  => SC.app1,
    Unknown: 224, // => SC.app2,
}

function translateKeyEventToScancode(ev) {
    const sc = keyCodeToScancodeMap[ev.code];
    if (sc !== undefined) {
        return sc
    }
    return null // no scancode mapping found
}

function createInputModule(canvas_element, getInstance, stop_fn) {
    // we don't want to have the default context menu on our canvas.
    // this event handler will prevent the default menu from opening:
    canvas_element.addEventListener('contextmenu', (ev) => ev.preventDefault())

    // add pass through of the mousedown, mouseup and mousemove event into zig:

    canvas_element.addEventListener('mousedown', (ev) => {
        let inst = getInstance()
        if (inst !== undefined) {
            inst._app_input_sendMouseDown(ev.clientX * window.devicePixelRatio, ev.clientY * window
                .devicePixelRatio, ev.button)
        }
    })

    canvas_element.addEventListener('mouseup', (ev) => {
        // ev.button: 0=>left, 1=>middle, 2=>right
        let inst = getInstance()
        if (inst !== undefined) {
            inst._app_input_sendMouseUp(ev.clientX * window.devicePixelRatio, ev.clientY * window
                .devicePixelRatio, ev.button)
        }
    })

    canvas_element.addEventListener('mousemove', (ev) => {
        let inst = getInstance()
        if (inst !== undefined) {
            inst._app_input_sendMouseMotion(ev.clientX * window.devicePixelRatio, ev.clientY * window
                .devicePixelRatio)
        }
    })

    // process keyboard input
    canvas_element.addEventListener('keydown', (ev) => {
        let inst = getInstance()
        if (inst === undefined) {
            return
        }

        if (ev.repeat == false) {
            let sc = translateKeyEventToScancode(ev)
            if (sc !== null) {
                inst._app_input_sendKeyDown(sc)
            } else {
                console.log('untranslated key code:', ev.code, ev)
            }
        }
    })

    canvas_element.addEventListener('keypress', (ev) => {
        let inst = getInstance()
        if (inst === undefined) {
            return
        }

        if (ev.isComposing || ev.keyCode === 229) {
            // this is a pure key-down event
            return
        }

        if (ev.charCode != 0) {
            inst._app_input_sendTextInput(
                ev.charCode,
                ev.shiftKey,
                ev.altKey,
                ev.ctrlKey,
                ev.metaKey,
            )
        }
    })

    canvas_element.addEventListener('keyup', (ev) => {
        let inst = getInstance()
        if (inst === undefined) {
            return
        }

        if (ev.repeat == false) {
            let sc = translateKeyEventToScancode(ev)
            if (sc !== null) {
                inst._app_input_sendKeyUp(sc)
            } else {
                console.log('untranslated key code:', ev.code, ev)
            }
        }
    })
}


export function startApplication(module, canvas) {
    const getModule = () => module;
    const platform = createPlatformEnvironment(getModule);
    const websocket = createWebsocketModule(getModule);
    module.zeroGraphics = { platform, websocket, stopped: false };
    createInputModule(canvas, () => module.zeroGraphics.stopped ? undefined : module);
    const resize = () => {
        canvas.width = Math.min(32767, Math.max(1, Math.round(canvas.clientWidth * devicePixelRatio)));
        canvas.height = Math.min(32767, Math.max(1, Math.round(canvas.clientHeight * devicePixelRatio)));
    };
    resize();
    if (module._app_init() !== 0) throw new Error('Could not initialize Zero Graphics');
    let finished = false;
    function stop() {
        if (!finished) {
            finished = true;
            module.zeroGraphics.stopped = true;
            module._app_deinit();
        }
    }
    module.zeroGraphics.stop = stop;
    function update() {
        if (module.zeroGraphics.stopped) return stop();
        resize();
        if (module._app_update() !== 0) {
            const message = getString(getModule, module._app_get_error_ptr(), module._app_get_error_len());
            stop();
            throw new Error(message);
        }
        requestAnimationFrame(update);
    }
    window.addEventListener('pagehide', stop, {once: true});
    requestAnimationFrame(update);
    return module;
}
