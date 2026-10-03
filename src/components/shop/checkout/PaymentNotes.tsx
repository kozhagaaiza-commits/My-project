/** Под кнопкой оплаты: «логотипы-текстом» способов оплаты и платёжной страницы (Блок 4). */
export function PaymentNotes({ className }: { className?: string }) {
  return (
    <div className={className}>
      <p className="text-center text-sm font-medium text-silver">Банковская карта · СБП</p>
      <p className="text-center text-xs text-muted-foreground">Оплата на защищённой странице ЮKassa</p>
    </div>
  );
}
