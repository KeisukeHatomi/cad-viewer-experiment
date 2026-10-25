#pragma once
#include <vector>
#include <emscripten.h>
#include <emscripten/val.h>

// Copy bounded chunks into ordinary JS arrays. No view can outlive a WASM
// growth or this bounded buffer; numbers retain their original double precision.
EM_JS(void, AppendStepNumbers, (emscripten::EM_VAL target, const double* values, int count), {
    const array = Emval.toValue(target);
    const start = values >>> 3;
    for (let i = 0; i < count; ++i) array.push(HEAPF64[start + i]);
});

class BufferedArrayWriter {
public:
    explicit BufferedArrayWriter(emscripten::val& target) : target(target), values(3072), used(0) {}
    void Add(double a, double b, double c) {
        if (used + 3 > values.size()) Flush();
        values[used++] = a; values[used++] = b; values[used++] = c;
    }
    void Flush() {
        if (!used) return;
        AppendStepNumbers(target.as_handle(), values.data(), static_cast<int>(used));
        used = 0;
    }
private:
    emscripten::val& target;
    std::vector<double> values;
    size_t used;
};
