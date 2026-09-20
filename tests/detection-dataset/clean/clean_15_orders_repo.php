<?php

final class OrderRepository
{
    public function __construct(private PDO $pdo)
    {
    }

    public function findByCustomer(int $customerId): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT id, total_satang, created_at FROM orders WHERE customer_id = ? ORDER BY created_at DESC'
        );
        $stmt->execute([$customerId]);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }
}
