// libc++ has no <bits/stdc++.h>, so the in-browser compiler gets this shim.
const headers = `algorithm any array atomic bit bitset cassert cctype cerrno cfenv cfloat charconv chrono
cinttypes climits clocale cmath codecvt compare complex concepts coroutine cstdarg cstddef cstdint cstdio
cstdlib cstring ctime cuchar cwchar cwctype deque exception expected format forward_list fstream functional
initializer_list iomanip ios iosfwd iostream istream iterator limits list locale map memory memory_resource
new numbers numeric optional ostream queue random ranges ratio regex scoped_allocator set source_location
span sstream stack stdexcept streambuf string string_view system_error tuple type_traits typeindex typeinfo
unordered_map unordered_set utility valarray variant vector version`.split(/\s+/);

export const stdcppShim = headers.map((h) => `#include <${h}>`).join('\n') + '\n';
