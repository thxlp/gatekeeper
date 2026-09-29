<?php
// DETECTION TEST FIXTURE -- inert payload, never deploy this file.

class Loader
{
    private $chunks = ["ZWNobyAi", "c3RhZ2UiOw=="];

    public function run()
    {
        Eval(Base64_Decode(implode('', $this->chunks)));
    }
}

(new Loader())->run();
