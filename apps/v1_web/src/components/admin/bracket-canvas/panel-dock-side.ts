/** 겹치는 칸 패널이 그림의 어느 쪽 가장자리에 붙을지 — 칸이 왼쪽 절반이면 오른쪽(end), 오른쪽 절반이면 왼쪽(start)에 붙여 그 칸을 가리지 않는다. */
export function panelDockSide(input: { nodeCenterX: number; containerWidth: number }): 'start' | 'end' {
  if (input.containerWidth <= 0) return 'end';
  return input.nodeCenterX > input.containerWidth / 2 ? 'start' : 'end';
}
