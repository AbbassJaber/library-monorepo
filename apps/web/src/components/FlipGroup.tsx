import { Component, createRef } from 'react';
import type { ReactNode } from 'react';
import type { FlipSnapshot } from '@/lib/motion';
import { loadedMotion, preloadMotionWhenIdle } from '@/lib/motionPrefs';

interface FlipGroupProps {
  layout: string;
  request: string;
  className?: string;
  children: ReactNode;
}

export class FlipGroup extends Component<FlipGroupProps> {
  private readonly scope = createRef<HTMLDivElement>();
  private shownRequest: string;

  constructor(props: FlipGroupProps) {
    super(props);
    this.shownRequest = props.request;
  }

  private cancelPreload: (() => void) | null = null;

  override componentDidMount() {
    this.cancelPreload = preloadMotionWhenIdle();
  }

  override componentWillUnmount() {
    this.cancelPreload?.();
  }

  override getSnapshotBeforeUpdate(previous: FlipGroupProps): FlipSnapshot | null {
    if (previous.layout === this.props.layout) return null;
    const answersNewRequest = this.props.request !== this.shownRequest;
    this.shownRequest = this.props.request;
    const motion = loadedMotion();
    const scope = this.scope.current;
    if (!answersNewRequest || !motion || !scope) return null;
    return motion.captureFlip(scope);
  }

  override componentDidUpdate(
    _previous: FlipGroupProps,
    _state: unknown,
    snapshot: FlipSnapshot | null
  ) {
    const scope = this.scope.current;
    if (snapshot && scope) loadedMotion()?.playFlip(snapshot, scope);
  }

  override render() {
    return (
      <div ref={this.scope} className={this.props.className}>
        {this.props.children}
      </div>
    );
  }
}
