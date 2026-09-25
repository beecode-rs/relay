// React 19 + RNTL v14: render/fireEvent wrap updates in act(), but the
// reconciler only flushes them synchronously (and without warnings) when
// this flag is set. Without it, a sync query right after fireEvent.press
// sees the pre-press tree.
global.IS_REACT_ACT_ENVIRONMENT = true
