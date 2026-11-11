/// <reference types="vite/client" />
/// <reference types="@iwsdk/vite-plugin-dev/client" />

declare const __COVER_BUILD__: string;
/** True only in the /emu/ build (tools/build-emu.mjs sets COVER_VARIANT=emu): the debug handle goes on window there only. */
declare const __COVER_EMU__: boolean;
