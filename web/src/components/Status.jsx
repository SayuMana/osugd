// Pesan hasil aksi. Selalu ada di DOM supaya screen reader mengumumkannya;
// waktu kosong dibikin sr-only agar tidak menambah jarak di flex container.
export default function Status({ children, className = "", as: Tag = "span" }) {
  return (
    <Tag role="status" className={children ? className : "sr-only"}>
      {children}
    </Tag>
  );
}
