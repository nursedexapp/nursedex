const BASE_URL = "https://nursedex.com";

export interface Breadcrumb {
  name: string;
  url: string;
}

/**
 * Breadcrumb trail for a blog post: Home > Blog > [Category] > Post. Pure,
 * so it is unit testable. The category step is included only when the post
 * has one.
 */
export function blogPostBreadcrumbs(
  post: { title: string; slug: string },
  category: { name: string; slug: string } | null,
): Breadcrumb[] {
  const crumbs: Breadcrumb[] = [
    { name: "Home", url: `${BASE_URL}/` },
    { name: "Blog", url: `${BASE_URL}/blog` },
  ];
  if (category) {
    crumbs.push({
      name: category.name,
      url: `${BASE_URL}/blog/category/${category.slug}`,
    });
  }
  crumbs.push({ name: post.title, url: `${BASE_URL}/blog/${post.slug}` });
  return crumbs;
}
