// borrowed from Blur-my-shell / Aurélien Hamy
// modified for Cinnamon by Kevin Langman 2025

const GObject  = imports.gi.GObject;
const St       = imports.gi.St;
const Cinnamon = imports.gi.Cinnamon;
const Clutter  = imports.gi.Clutter;
const Gio      = imports.gi.Gio;
const GLib     = imports.gi.GLib;

const SHADER_FILENAME = 'corner.glsl';
const SHADOW_SHADER_FILENAME = 'shadow.glsl';

// Border modes (must match corner.glsl)
var BorderMode = { NONE: 0, AUTO: 1, CUSTOM: 2, MATCH: 3 };
const DEFAULT_BORDER = { mode: BorderMode.NONE, width: 1, contrast: 0.2, color: [0, 0, 0, 0.3] };

// Clutter's offscreen effects don't render into a texture the size of the actor. The
// texture covers the actor's paint volume (in actor coordinates), padded by
// _clutter_actor_box_enlarge_for_effects() (clutter-actor-box.c):
//     x2 = ceil(x2 + 0.75);  x1 = x2 - round(x2 - x1) - 3
// Given the paint volume's extent along one axis (v1..v2), return the texture size and
// where the actor's origin (0) sits inside the texture.
function fboGeometry(v1, v2) {
    let rounded = Math.round(v2 - v1);
    let x2 = Math.ceil(v2 + 0.75);
    let x1 = x2 - rounded - 3;
    return { size: x2 - x1, offset: -x1 + FBO_OFFSET_CORRECTION };
}

// The stock formula above matches what Clutter does on every Cinnamon version (6.0 - 6.6):
// the actor's origin lands 2px into the texture and the texture is size + 3. A Muffin with
// a modified _clutter_actor_box_enlarge_for_effects() (e.g. one that centres the padding)
// puts it elsewhere; adjust here only for that kind of local build.
const FBO_OFFSET_CORRECTION = 0;

// GJS turns a whole JS number into an int GValue, which a float uniform rejects.
// Nudge whole numbers so they are always passed as doubles.
function asFloat(value) {
    value = Number(value);
    return Number.isInteger(value) ? value + 1e-6 : value;
}
const DEFAULT_PARAMS = {
    radius: 12, width: 0, height: 0,
    corners_top: true, corners_bottom: true,
    clip: [0, 0, -1, -1]
};

// This loads a GLSL file from the extension's resources to a JavaScript string. The
// code from "common.glsl" is prepended automatically.
function loadShaderResource(uuid, file_name) {
    let file;
    file = Gio.File.new_for_path( GLib.get_home_dir() + '/.local/share/cinnamon/extensions/' + uuid  + "/6.0/" + file_name );
    let [data, etag] = file.load_bytes(null);
    let code = new TextDecoder().decode(data.get_data());

    // Add a trailing newline. Else the GLSL compiler complains...
    return code + '\n';
}

var CornerEffect = (typeof global === 'undefined') ?
    { default_params: DEFAULT_PARAMS } :
    new GObject.registerClass({
        GTypeName: `RoundedCornerEffect_${Math.floor(Math.random() * 100000) + 1}`,
        Properties: {
            'radius': GObject.ParamSpec.double(
                `radius`,
                `Corner Radius`,
                `Corner Radius`,
                GObject.ParamFlags.READWRITE,
                0, Number.MAX_SAFE_INTEGER,
                12,
            ),
            'width': GObject.ParamSpec.double(
                `width`,
                `Width`,
                `Width`,
                GObject.ParamFlags.READWRITE,
                0.0, Number.MAX_SAFE_INTEGER,
                0.0,
            ),
            'height': GObject.ParamSpec.double(
                `height`,
                `Height`,
                `Height`,
                GObject.ParamFlags.READWRITE,
                0.0, Number.MAX_SAFE_INTEGER,
                0.0,
            ),
            'corners_top': GObject.ParamSpec.boolean(
                `corners_top`,
                `Round top corners`,
                `Round top corners`,
                GObject.ParamFlags.READWRITE,
                true,
            ),
            'corners_bottom': GObject.ParamSpec.boolean(
                `corners_bottom`,
                `Round bottom corners`,
                `Round bottom corners`,
                GObject.ParamFlags.READWRITE,
                true,
            ),
            // FIXME this works but it logs an error, because I'm not a double...
            // I don't want to fiddle with GVariants again
            'clip': GObject.ParamSpec.double(
                `clip`,
                `Clip`,
                `Clip`,
                GObject.ParamFlags.READWRITE,
                0.0, Number.MAX_SAFE_INTEGER,
                0.0,
            ),
        }
    }, class CornerEffect extends Clutter.ShaderEffect {
        // params: the GObject properties above (radius, corners_top, ...)
        // border: {mode, width, contrast, color: [r, g, b, a]} (optional, see setBorder())
        constructor(uuid, params, border) {
            super(params);

            this._clip_x0 = null;
            this._clip_y0 = null;
            this._clip_width = null;
            this._clip_height = null;

            this._radius = (params.radius) ? params.radius : DEFAULT_PARAMS.radius;
            this._width = (params.width) ? params.width : DEFAULT_PARAMS.width;
            this._height = (params.height) ? params.height : DEFAULT_PARAMS.height;
            // Use ?? (not a truthiness test) so that an explicit false is kept
            this._corners_top = params.corners_top ?? DEFAULT_PARAMS.corners_top;
            this._corners_bottom = params.corners_bottom ?? DEFAULT_PARAMS.corners_bottom;
            this._clip = (params.clip) ? params.clip : DEFAULT_PARAMS.clip;

            // set shader source
            this._source = loadShaderResource(uuid, SHADER_FILENAME);
            if (this._source)
                this.set_shader_source(this._source);

            // Make sure the shader sees the requested corners, whatever the
            // property setters did (or didn't do) during construction
            this.set_uniform_value('corners_top', this._corners_top ? 1 : 0);
            this.set_uniform_value('corners_bottom', this._corners_bottom ? 1 : 0);

            this.setBorder(border);

            //TODO: Get this code working in Cinnamon
            //const theme_context = St.ThemeContext.get_for_stage(global.stage);
            //theme_context.connectObject('notify::scale-factor', _ => this.update_radius(), this);
        }

        // Set the border drawn just inside the rounded edge.
        //   mode:     BorderMode.NONE, AUTO (edge colour with contrast added), CUSTOM (fixed colour)
        //             or MATCH (continue the window's own border colours around the corners)
        //   width:    border width in pixels
        //   contrast: 0..1, used by AUTO
        //   color:    [r, g, b, a] each 0..1, used by CUSTOM
        setBorder(border) {
            let b = Object.assign({}, DEFAULT_BORDER, border || {});
            let color = b.color || DEFAULT_BORDER.color;
            this._border = b;
            this.set_uniform_value('border_mode', Math.round(b.mode));
            this.set_uniform_value('border_width', asFloat(b.width));
            this.set_uniform_value('border_contrast', asFloat(b.contrast));
            this.set_uniform_value('border_r', asFloat(color[0]));
            this.set_uniform_value('border_g', asFloat(color[1]));
            this.set_uniform_value('border_b', asFloat(color[2]));
            this.set_uniform_value('border_a', asFloat(color[3] ?? 1));
        }

        // Work out the offscreen texture's size and where the actor sits in it, from the
        // actor's paint volume (falling back to its size), and pass them to the shader.
        // Call again whenever the actor's size or paint volume may have changed.
        updateTextureGeometry() {
            // The texture is sized from the paint volume as seen by this effect, which
            // only includes effects added *before* it (ShadowPaddingEffect is added after,
            // so it doesn't count). For the surface actor that is its own size.
            let x1 = 0, y1 = 0, x2 = this._width || 0, y2 = this._height || 0;
            let fx = fboGeometry(x1, x2);
            let fy = fboGeometry(y1, y2);
            this._texGeometry = { volume: [x1, y1, x2, y2], width: fx.size, height: fy.size, offsetX: fx.offset, offsetY: fy.offset };
            this.set_uniform_value('tex_width', asFloat(fx.size));
            this.set_uniform_value('tex_height', asFloat(fy.size));
            this.set_uniform_value('tex_offset_x', asFloat(fx.offset));
            this.set_uniform_value('tex_offset_y', asFloat(fy.offset));
        }

        static get default_params() {
            return DEFAULT_PARAMS;
        }

        get radius() {
            return this._radius;
        }

        set radius(value) {
            if (this._radius !== value) {
                this._radius = value;

                this.update_radius();
            }
        }

        update_radius() {
            const theme_context = St.ThemeContext.get_for_stage(global.stage);
            let radius = Math.min(
                this.radius * theme_context.scale_factor,
                this.width / 2, this.height / 2
            );
            if (this._clip_width >= 0 || this._clip_height >= 0)
                radius = Math.min(radius, this._clip_width / 2, this._clip_height / 2);

            this.set_uniform_value('radius', parseFloat(radius - 1e-6));
        }

        get width() {
            return this._width;
        }

        set width(value) {
            if (this._width !== value) {
                this._width = value;

                this.set_uniform_value('width', parseFloat(this._width - 1e-6));
                this.updateTextureGeometry();
                this.update_radius();
            }
        }

        get height() {
            return this._height;
        }

        set height(value) {
            if (this._height !== value) {
                this._height = value;

                this.set_uniform_value('height', parseFloat(this._height - 1e-6));
                this.updateTextureGeometry();
                this.update_radius();
            }
        }

        get corners_top() {
            return this._corners_top;
        }

        set corners_top(value) {
            if (this._corners_top !== value) {
                this._corners_top = value;

                this.set_uniform_value('corners_top', this._corners_top ? 1 : 0);
            }
        }

        get corners_bottom() {
            return this._corners_bottom;
        }

        set corners_bottom(value) {
            if (this._corners_bottom !== value) {
                this._corners_bottom = value;

                this.set_uniform_value('corners_bottom', this._corners_bottom ? 1 : 0);
            }
        }

        get clip() {
            return [this._clip_x0, this._clip_y0, this._clip_width, this._clip_height];
        }

        set clip(value) {
            [this._clip_x0, this._clip_y0, this._clip_width, this._clip_height] = value;
            this.set_uniform_value('clip_x0', parseFloat(this._clip_x0 - 1e-6));
            this.set_uniform_value('clip_y0', parseFloat(this._clip_y0 - 1e-6));
            this.set_uniform_value('clip_width', parseFloat(this._clip_width - 1e-6));
            this.set_uniform_value('clip_height', parseFloat(this._clip_height - 1e-6));
            this.update_radius();
        }

        vfunc_set_actor(actor) {
            if (this._actor_connection_size_id) {
                let old_actor = this.get_actor();
                old_actor?.disconnect(this._actor_connection_size_id);
            }

            if (actor) {
                this.width = actor.width;
                this.height = actor.height;
                this._actor_connection_size_id = actor.connect('notify::size', _ => {
                    this.width = actor.width;
                    this.height = actor.height;
                });

                // No clip until the extension sets one (negative size = whole texture)
                this.clip = [0, 0, -10, -10];
            }
            else {
                this._actor_connection_size_id = null;
            }

            super.vfunc_set_actor(actor);
            // get_actor() is only valid after the parent class has stored the actor
            this.updateTextureGeometry();
        }
    });

// Enlarges the surface actor's paint volume to cover the shadow. Muffin's window actor
// includes the surface's paint volume in its own, so this makes Clutter redraw the
// shadow area when the window moves or changes (the shadow actor itself isn't part of
// the window actor's paint volume). Add it to the surface *after* the CornerEffect, so
// it doesn't enlarge the CornerEffect's texture. It doesn't render anything.
var ShadowPaddingEffect = (typeof global === 'undefined') ? null :
    GObject.registerClass({
        GTypeName: `RoundedCornerShadowPadding_${Math.floor(Math.random() * 100000) + 1}`,
    }, class ShadowPaddingEffect extends Clutter.Effect {
        _init(params) {
            super._init(params);
            this._box = null;
        }

        // The area (actor coordinates) that must be painted: x1, y1, x2, y2
        setBox(x1, y1, x2, y2) {
            this._box = [x1, y1, x2, y2];
            this.get_actor()?.queue_redraw();
        }

        vfunc_modify_paint_volume(volume) {
            if (this._box)
                volume.union_box(new Clutter.ActorBox({ x1: this._box[0], y1: this._box[1], x2: this._box[2], y2: this._box[3] }));
            return true;
        }
    });

// Draws the soft shadow of a rounded window. It goes on a plain Clutter.Actor placed
// inside the window actor, below the window surface, sized to cover the shadow; the
// actor's own content is ignored. Its paint volume starts at its own origin, so the
// texture placement is the same well-tested case as CornerEffect's (fboGeometry(0, size)).
var ShadowEffect = (typeof global === 'undefined') ? null :
    GObject.registerClass({
        GTypeName: `RoundedCornerShadowEffect_${Math.floor(Math.random() * 100000) + 1}`,
    }, class ShadowEffect extends Clutter.ShaderEffect {
        _init(uuid) {
            super._init();
            let source = loadShaderResource(uuid, SHADOW_SHADER_FILENAME);
            if (source)
                this.set_shader_source(source);
        }

        // width/height: the shadow actor's size
        // rect: the window's rounded rectangle in the shadow actor's pixels [x0, y0, x1, y1]
        // shadow: {size, opacity (0..1), offsetY, radius, top, bottom}
        update(width, height, rect, shadow) {
            let fx = fboGeometry(0, width);
            let fy = fboGeometry(0, height);
            this.set_uniform_value('tex_width', asFloat(fx.size));
            this.set_uniform_value('tex_height', asFloat(fy.size));
            this.set_uniform_value('tex_offset_x', asFloat(fx.offset));
            this.set_uniform_value('tex_offset_y', asFloat(fy.offset));
            this.set_uniform_value('rect_x0', asFloat(rect[0]));
            this.set_uniform_value('rect_y0', asFloat(rect[1]));
            this.set_uniform_value('rect_x1', asFloat(rect[2]));
            this.set_uniform_value('rect_y1', asFloat(rect[3]));
            this.set_uniform_value('radius', asFloat(Math.min(shadow.radius, (rect[2] - rect[0]) / 2, (rect[3] - rect[1]) / 2)));
            this.set_uniform_value('corners_top', shadow.top ? 1 : 0);
            this.set_uniform_value('corners_bottom', shadow.bottom ? 1 : 0);
            this.set_uniform_value('shadow_size', asFloat(shadow.size));
            this.set_uniform_value('shadow_opacity', asFloat(shadow.opacity));
            this.set_uniform_value('shadow_offset_y', asFloat(shadow.offsetY));
        }
    });
