import {Component, type ReactNode} from 'react';
import {t} from '../lib/texts';

/**
 * A screen that fails to draw shows a message and a way back, instead of leaving the page blank.
 * The error still reaches the console for whoever fixes it.
 */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey: string }, { failed: boolean; key: string }> {
    state = {failed: false, key: this.props.resetKey};

    static getDerivedStateFromError() {
        return {failed: true};
    }

    static getDerivedStateFromProps(props: { resetKey: string }, state: { failed: boolean; key: string }) {
        // Going to another screen tries again.
        return props.resetKey !== state.key ? {failed: false, key: props.resetKey} : null;
    }

    render() {
        if (!this.state.failed) return this.props.children;
        return (
            <div className="screen screen-no-bottom">
                <div className="scroll scroll-bare-top">
                    <div className="done">
                        <p className="big">{t('app.crashed')}</p>
                        <button type="button" className="btn btn-lg" onClick={() => location.reload()}>{t('app.reload')}</button>
                    </div>
                </div>
            </div>
        );
    }
}
