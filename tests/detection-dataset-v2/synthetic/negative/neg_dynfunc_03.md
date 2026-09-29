# Why dynamic function construction is flagged

Both `create_function()` in PHP and the `new Function()` constructor in
JavaScript turn a plain string into executable code, so a static scanner
cannot tell what will actually run. Prefer closures, a lookup table of
named handlers, or a small expression interpreter over building code at
runtime.
