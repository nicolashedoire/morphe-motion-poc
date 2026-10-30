export interface IKPoint { x: number; y: number }
export interface BendReference { side: number; angle: number; axis: number; ratio: number; shape?: number[] }
export function ikBendReference(points: IKPoint[], lengths: number[], previous?: BendReference): BendReference;
export function solveIKPoints(points: IKPoint[], lengths: number[], target: IKPoint, bendDirection?: number, options?: { iterations?: number; tolerance?: number; bendReference?: BendReference }): { iterations: number; error: number; bendReference?: BendReference };
