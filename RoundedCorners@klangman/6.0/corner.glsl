// Borrowed from Blur-my-shell / Aurélien Hamy
// Heavily based on https://github.com/yilozt/rounded-window-corners
// which is itself based on upstream Mutter code
// Signed-distance rounding and border added for Cinnamon by Kevin Langman 2026

uniform sampler2D tex;
uniform float radius;
uniform float width;      // actor size
uniform float height;
// Clutter's offscreen texture is padded around the actor (see corner.js, fboGeometry())
uniform float tex_width;  // texture size
uniform float tex_height;
uniform float tex_offset_x;  // actor origin inside the texture
uniform float tex_offset_y;
uniform bool corners_top;
uniform bool corners_bottom;

uniform float clip_x0;
uniform float clip_y0;
uniform float clip_width;
uniform float clip_height;

// Border drawn just inside the rounded edge
uniform int   border_mode;      // 0 = none, 1 = automatic (contrast), 2 = custom colour,
                                // 3 = match (continue the window's own edge colours around the corners)
uniform float border_width;     // pixels
uniform float border_contrast;  // 0..1, how far auto mode moves the edge colour towards black/white
uniform float border_r;         // custom colour (not premultiplied), 0..1
uniform float border_g;
uniform float border_b;
uniform float border_a;

// Signed distance from p to the edge of a rounded box: < 0 inside, > 0 outside
float rounded_box_sdf(vec2 p, vec2 center, vec2 half_size, float r) {
    vec2 q = abs(p - center) - half_size + r;
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

void main(void) {
    vec2 uv = cogl_tex_coord_in[0].xy;
    vec2 tex_size = vec2(tex_width, tex_height);
    vec2 tex_offset = vec2(tex_offset_x, tex_offset_y);
    vec2 pos = uv * tex_size - tex_offset;   // position in actor pixels
    vec4 c = texture2D(tex, uv);   // premultiplied alpha

    // Visible window rectangle (x0, y0, x1, y1) in texture pixels
    vec4 bounds;
    if (clip_width < 0. || clip_height < 0.) {
        bounds = vec4(clip_x0, clip_y0, clip_x0 + width, clip_y0 + height);
    } else {
        bounds = vec4(clip_x0, clip_y0, clip_x0 + clip_width, clip_y0 + clip_height);
    }
    vec2 center = (bounds.xy + bounds.zw) * 0.5;
    vec2 half_size = (bounds.zw - bounds.xy) * 0.5;

    // Top or bottom half decides which corner setting applies
    float r = (pos.y < center.y) ? (corners_top ? radius : 0.) : (corners_bottom ? radius : 0.);
    float d = rounded_box_sdf(pos, center, half_size, r);

    // Anti-aliased window shape
    float coverage = clamp(0.5 - d, 0., 1.);

    vec4 result = c;
    if (border_mode != 0 && border_width > 0.) {
        // 1 inside the outer border_width pixels, fading over one pixel on the inner side
        float band = clamp(d + border_width + 0.5, 0., 1.);

        if (border_mode == 3) {
            // Continue the window's own border around the rounded corners: take the colour
            // from the nearest point on the straight vertical and horizontal edges, at the
            // same depth in from the edge, and blend the two by angle. On the straight
            // edges this samples the pixel itself, so nothing changes there.
            float depth = clamp(-d, 0.5, max(border_width - 0.5, 0.5));
            float ex = (pos.x < center.x) ? bounds.x + depth : bounds.z - depth;
            float ey = (pos.y < center.y) ? bounds.y + depth : bounds.w - depth;
            vec4 cv = texture2D(tex, (vec2(ex, clamp(pos.y, bounds.y + r, bounds.w - r)) + tex_offset) / tex_size);
            vec4 ch = texture2D(tex, (vec2(clamp(pos.x, bounds.x + r, bounds.z - r), ey) + tex_offset) / tex_size);
            vec2 off = abs(pos - center) - (half_size - r);   // both > 0 inside a corner region
            float w = (off.x > 0. && off.y > 0.) ? off.x / (off.x + off.y) : ((off.x > off.y) ? 1. : 0.);
            result = mix(c, mix(ch, cv, w), band);
        } else {
            vec3 rgb = (c.a > 0.) ? c.rgb / c.a : vec3(0.);
            vec3 border_rgb;
            float strength;
            if (border_mode == 1) {
                // Move this pixel's own colour towards black (if light) or white (if dark)
                float luma = dot(rgb, vec3(0.299, 0.587, 0.114));
                vec3 target = (luma > 0.5) ? vec3(0.) : vec3(1.);
                border_rgb = mix(rgb, target, border_contrast);
                strength = band;
            } else {
                border_rgb = vec3(border_r, border_g, border_b);
                strength = band * border_a;
            }
            // Composite the border over the window ("over" with premultiplied alpha)
            result = vec4(border_rgb * strength, strength) + c * (1. - strength);
        }
    }

    // The window cut to the rounded shape; cogl_color_in carries the actor's paint
    // opacity (e.g. window fade animations)
    cogl_color_out = result * coverage * cogl_color_in.a;
}
