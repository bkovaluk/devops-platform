/**
 * The font files, from Fontsource, loaded once for the whole app: Mona Sans on
 * its weight axis, Hubot Sans and Martian Mono on weight and width (the
 * wordmark sets Hubot Sans wide, mono text sets Martian Mono narrow). The
 * tokens in `index.css` name the families they declare (`--font-sans`,
 * `--font-display`, `--font-mono`), so a new pairing is this file, those
 * values and package.json.
 */
import '@fontsource-variable/mona-sans'
import '@fontsource-variable/hubot-sans/wdth.css'
import '@fontsource-variable/martian-mono/wdth.css'
