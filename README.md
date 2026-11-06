# JUDAS: Night Shift

An asset-free, first-person browser horror prototype based on the abandoned hospital story. The 3D-style corridor renderer, hospital layout, items, and monster are drawn in Canvas; no game engine, external model, or network connection is required.

## Play

Open `index.html` in a desktop or mobile browser. Select **Enter the Hospital** to start.

| Action | Desktop | Touch screen |
| --- | --- | --- |
| Move | W/A/S/D or WASD | Left virtual stick |
| Look | Mouse; arrow keys turn | Drag on the game view |
| Interact | E | Use button |
| Flashlight | F | Light button |
| Run / crouch | Shift / C | Run / Crouch buttons |

Find eight ward keys, read Dr. Vale's note for the exit code, and reach the service exit. Patient records reveal what happened. The emergency transmitter in the south east ward unlocks the hidden ending when all four records are found. Keep the flashlight battery for dark rooms; running and walking can attract the creature. Crouch to make less noise and reduce how far away the creature can spot you. Fallen cabinets and collapsed passages break up long sightlines, but the creature can navigate around them.

## Prototype scope

This is a compact playable browser prototype, rather than a finished Unity/Android production. It includes a single hospital map, patrol / investigate / chase / search creature states, flashlight battery pickups, four story records, the four-digit exit puzzle, and three endings. Visuals use Canvas primitives so the game stays portable and easy to remix.
