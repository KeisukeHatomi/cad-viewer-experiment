
#pragma once
#ifdef __EMSCRIPTEN__
#include <emscripten/val.h>
#include <emscripten/heap.h>
static inline void ReportStepProgress (const char* phase, int completed = 0, int total = 0, int flags = 0)
{
    emscripten::val callback = emscripten::val::module_property ("onProgress");
    if (callback.isUndefined () || callback.isNull ()) return;
    emscripten::val event = emscripten::val::object ();
    event.set ("phase", phase);
    event.set ("completed", completed);
    event.set ("total", total);
    event.set ("flags", flags);
    event.set ("wasmBytes", static_cast<double> (emscripten_get_heap_size ()));
    callback (event);
}
#else
static inline void ReportStepProgress (const char*, int = 0, int = 0, int = 0) {}
#endif
