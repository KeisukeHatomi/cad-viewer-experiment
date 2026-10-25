#include "buffered-array-writer.hpp"
#include <cassert>
#include <cmath>
int main() {
    emscripten::val output = emscripten::val::array();
    BufferedArrayWriter writer(output);
    for (int i = 0; i < 4099; ++i) writer.Add(i * 0.125, -i * 1.25, 4294967295.0 - i);
    writer.Flush();
    assert(output["length"].as<int>() == 4099 * 3);
    for (int i = 0; i < 4099; ++i) {
        assert(output[i * 3].as<double>() == i * 0.125);
        assert(output[i * 3 + 1].as<double>() == -i * 1.25);
        assert(output[i * 3 + 2].as<double>() == 4294967295.0 - i);
    }
    writer.Flush();
    assert(output["length"].as<int>() == 4099 * 3);
    return 0;
}
