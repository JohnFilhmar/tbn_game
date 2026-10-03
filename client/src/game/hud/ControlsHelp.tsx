function Key({ children }: { children: string }) {
  return (
    <kbd className="rounded-sm border border-slate-600 bg-slate-800 px-1 font-display text-slate-100">
      {children}
    </kbd>
  );
}

/** The world's keys, one line under the prompts. */
export function ControlsHelp() {
  return (
    <p className="leading-relaxed">
      <Key>WASD</Key> walk · <Key>Shift</Key> run · drag look · wheel zoom · <Key>C</Key> camera ·{' '}
      <Key>E</Key> talk, use or sit · <Key>1-9</Key> go to an agent · <Key>B</Key> build ·{' '}
      <Key>F3</Key> frame rate
    </p>
  );
}
