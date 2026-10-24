# xDesk

A quieter X. One centered column, posts as cards or a single continuous stack, and the left sidebar replaced by a dock at the bottom of the screen.

This is a design exploration, not a product. It is an unpacked Manifest V3 extension that restyles `x.com` locally in the browser. Nothing is sent anywhere; the only permission it asks for is `storage`, and that is used to remember your own settings.

## What it changes

- **One centered column.** The sidebar, trends and drawers are hidden. The column width matches X's own 600px post cap, so headers, tabs and posts line up.
- **Surfaces instead of lines.** Posts are separated by tone, not hairlines: page → card → quoted post are three shades, no borders.
- **Two timeline modes.** With a gap between posts you get separate rounded cards. Set the gap to zero and the timeline becomes one continuous surface with a hairline between posts and rounding only at the ends.
- **A dock.** The navigation sits at the bottom center as a glass pill, with macOS-style magnification on hover. It hides when you scroll down and comes back when you scroll up or move the pointer to the bottom edge.
- **Accent colour everywhere.** X's blue is replaced with your accent colour; the verified badge stays blue.
- **A small mascot.** A chat orb that follows the cursor and opens X's chat. It can be dragged anywhere and remembers where you put it.
- **Drawn shapes.** A background layer of hand-drawn figures: spirals, grass tufts, ripples, waves, tangles, the Tesla mark and X.com's own letter. Each one draws itself in, stands whole for a while, then unravels along the same line. Every cycle picks a new figure, size and place, and the hand wobble is random, so no two passes are identical.
- **Draw on it yourself.** Drag on the empty background beside the column and you draw in the same ink as the figures. Double-click leaves a note there. Both survive a reload, and neither is ever in X's way.
- **Kanji fish.** The earlier background layer: fish drawn from fish-related kanji, drifting behind the timeline. Off by default now that the shapes are there; raise the count to bring them back.

Everything above is adjustable from the extension popup: colours, column width, corner radius, post gap, icon sizes, counter weight and size, action bar spacing, background tone, shape count, fish count and font.

## Install

1. Clone or download this repository.
2. Open `chrome://extensions` (or `brave://extensions`).
3. Enable **Developer mode**.
4. **Load unpacked** → select this folder.

The browser loads the extension from the folder you picked and does not copy the files, so don't move or rename the folder afterwards. After editing anything, press the reload icon on the extensions page and hard-refresh the tab.

## One thing worth a look

X caps posts at 600px, but the page header and the tab bar center themselves on the column, which is wider. In the default UI the heading, the tabs and the posts are therefore not on the same vertical axis. It is a few dozen pixels and easy to miss, but once seen it is hard to unsee. xDesk fixes it by narrowing the column to the post width rather than widening the posts.

## How it works

Most of it is CSS. A few things cannot be done in CSS and live in `content.js`:

- **Composer width.** X narrows timeline cards in ways that cannot be caught reliably from CSS — the constraint can come from any wrapper level and any property. The real card width is measured at runtime and handed to the composer as custom properties.
- **The dock.** The header is collapsed to zero and hidden; only `nav` is lifted back out as a fixed element. Hover magnification is split in two: the scale sits on the link so the unread badge rides along, and the lift sits on an inner wrapper — a lift on the link itself moves its bottom edge past the cursor and the icons flicker.
- **The chat orb's face.** The orb stays a circle. The eyes sit on a plane at `translateZ` height that rotates with the cursor, so perspective produces the parallax and foreshortening on its own: the near eye travels further, the far one narrows. That is what reads as a head turning.
- **Replacing X's blue.** The colour comes from generated class names that change between builds, so the classes are found at runtime by reading X's own style rules and matching `rgb(29, 155, 240)`. Only single-class selectors are accepted, so the rule can never apply more widely than X's own.
- **Drawing in line.** Each figure is one path whose dash is as long as the path itself. Moving the offset from that length to zero draws the line; carrying on to minus the length unravels it from the end it started at. The length is only known once the path is in the document, so it is measured there and handed back to CSS as a custom property. Dashing restarts at every subpath, so a figure's parts draw side by side rather than one after another — the two recognisable marks get a longer hold so they stand complete before they come apart.
- **Drawing without blocking X.** The layer sits behind the page and takes no pointer events. A press only becomes a stroke if it lands outside the column, header, dialogs and controls, and only after a few pixels of movement, so ordinary clicks still reach X untouched; the click that ends a stroke is swallowed once. Notes are typed in a small editor above the page and stamped into the background when you click away, because a layer that takes no clicks cannot be typed into.
- **Diagnostics.** The popup has a state section the content script writes to, so layout problems can be inspected without the console.

## Caveats

- It depends on X's DOM structure and `data-testid` attributes. An X update can break individual rules. The comments in `content.css` explain the reason behind each non-obvious rule — several are shaped the way they are because of a specific problem found and fixed.
- Chrome and Brave only. Not tested on Firefox.
- Not published to any store. Load it unpacked or don't.

## License

MIT
