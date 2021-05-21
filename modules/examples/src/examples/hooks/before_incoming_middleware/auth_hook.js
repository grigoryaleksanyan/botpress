if (event.type === 'auth-user') {
  event.state.user.auth = event.payload.payload.user
  event.setFlag(bp.IO.WellKnownFlags.SKIP_DIALOG_ENGINE, true)
}
