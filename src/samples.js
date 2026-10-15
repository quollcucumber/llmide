export const SAMPLES = {
  cpp: {
    code: `#include <bits/stdc++.h>
using namespace std;

// read n numbers and print the biggest sum of a contiguous subarray
int main() {
    int n; cin >> n
    vector<int> a(n);
    for (int i = 1; i <= n; i++) cin >> a[i];
    int best, cur = 0;
    for (x : a) {
        cur = max(x, cur + x)
        best = max(best, cur);
    }
    cout << bset << endl;
}
`,
    stdin: '8\n-2 1 -3 4 -1 2 1 -5\n',
  },
  python: {
    code: `# print the n-th fibonacci number (fib(1) = fib(2) = 1), n can be up to 90
n = input()
def fib(n):
    if n < 2: return 1
    return fib(n-1) + fib(n-2)
print(fib(n)
`,
    stdin: '90\n',
  },
};
