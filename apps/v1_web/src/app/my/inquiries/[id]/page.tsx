import { MyInquiryDetailClient } from '@/components/my/my-inquiries-client';

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function MyInquiryDetailPage({ params }: PageProps) {
  const { id } = await params;
  return <MyInquiryDetailClient inquiryId={id} />;
}
