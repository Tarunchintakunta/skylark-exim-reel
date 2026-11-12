import { QuadraticBezierCurve3, Vector3 } from 'three'

const D = Math.PI / 180

/** lat/lon → point on a sphere, matching three's SphereGeometry equirectangular UVs. */
export function latLon(lat: number, lon: number, r = 1) {
  const phi = (90 - lat) * D
  const theta = (lon + 180) * D
  return new Vector3(-r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta))
}

/** Gold route: quadratic bezier from origin to target, its control point lifted by `lift` × arc length (0.25 in BLENDER_GLB_SPEC "The globe"). */
export function routePoints(from: Vector3, to: Vector3, n = 64, lift = 0.25) {
  const arc = from.angleTo(to)
  const mid = from.clone().add(to).normalize().multiplyScalar(1 + lift * arc)
  return new QuadraticBezierCurve3(from, mid, to).getPoints(n)
}

/** Euler (order XYZ) that turns (lat, lon) to face a camera on +Z. */
export function faceRotation(lat: number, lon: number): [number, number] {
  const p = latLon(lat, lon)
  return [lat * D, -Math.atan2(p.x, p.z)]
}

/** Point on (or off) the sphere → [lat, lon] in degrees: the inverse of latLon. */
export function toLatLon(p: Vector3): [number, number] {
  const v = p.clone().normalize()
  return [Math.asin(v.y) / D, Math.atan2(v.z, -v.x) / D - 180]
}
