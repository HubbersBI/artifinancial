/**
 * Cholesky decomposition, replacing numpy.linalg.cholesky.
 *
 * The simulator needs correlated normal draws: given a correlation matrix C,
 * find lower-triangular L with L * L^T = C, then L @ z turns independent draws
 * into correlated ones. n is the ticker count, well under 50, so the textbook
 * O(n^3) form is far more than fast enough.
 */

/**
 * Returns lower-triangular L, or null when the matrix is not positive definite.
 *
 * numpy raises in that case. Null instead, because the caller can carry on with
 * uncorrelated draws: prices that move independently are a smaller flaw than a
 * dead simulation, and a user adding an odd ticker should not stop the market.
 */
export function cholesky(matrix: number[][]): number[][] | null {
  const n = matrix.length;
  const lower: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));

  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j <= i; j += 1) {
      let sum = 0;
      for (let k = 0; k < j; k += 1) sum += lower[i][k] * lower[j][k];

      if (i === j) {
        const diagonal = matrix[i][i] - sum;
        if (diagonal <= 0) return null;
        lower[i][j] = Math.sqrt(diagonal);
      } else {
        lower[i][j] = (matrix[i][j] - sum) / lower[j][j];
      }
    }
  }
  return lower;
}

/** Multiply lower-triangular L by vector z. Only the filled half is walked. */
export function applyLower(lower: number[][], vector: number[]): number[] {
  return lower.map((row, i) => {
    let sum = 0;
    for (let j = 0; j <= i; j += 1) sum += row[j] * vector[j];
    return sum;
  });
}
