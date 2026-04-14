/** When true, the next chat mount should pin JARVIS as the thread agent mention. */

let demoJarvisArmed = false;

export function armDemoJarvisForChat(): void {
  demoJarvisArmed = true;
}

export function disarmDemoJarvisForChat(): void {
  demoJarvisArmed = false;
}

export function isDemoJarvisArmed(): boolean {
  return demoJarvisArmed;
}
