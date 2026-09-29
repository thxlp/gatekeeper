<?php
// Static analysis helper used by our own pre-commit hook.
final class DangerousCallLinter
{
    private const BANNED = ['eval', 'assert', 'create_function'];

    public function scan(string $source): array
    {
        $hits = [];
        foreach (self::BANNED as $fn) {
            if (stripos($source, $fn . '(') !== false) {
                $hits[] = $fn;
            }
        }
        return $hits;
    }
}
